import type { Cell } from 'exceljs';
import type { AttendanceAbsenceRow } from '@/features/attendances/api';
import { addCrest, laoFont, numberFont, safeFileName, THIN_BORDER } from '@/lib/workbook';
import type { AttendanceTotals, ClassAttendanceRow } from './attendance-summary';
import {
  addHeaderRow,
  addHeading,
  addNotes,
  addSignatures,
  REPORT_PAGE_SETUP,
} from './report-sheet';

/** Every string the workbook prints, resolved by the caller through `t`. */
export interface AttendanceSummaryLabels {
  schoolName: string;
  /** ສະຫຼຸບການມາຮຽນ ພາກຮຽນທີ 1 — ເດືອນ ຕຸລາ. */
  title: string;
  classSheet: string;
  studentSheet: string;
  /** ນັກຮຽນທີ່ຂາດ 15 ວັນຂຶ້ນໄປ. */
  studentTitle: string;
  number: string;
  classroom: string;
  headcount: string;
  recorded: string;
  late: string;
  absentExcused: string;
  absentUnexcused: string;
  absentTotal: string;
  overThreshold: string;
  rate: string;
  total: string;
  studentCode: string;
  student: string;
  nobody: string;
  /** How the figures are counted — the late rule, the rate. */
  note: string;
  director: string;
  reporter: string;
  signatureDate: string;
  printedOn: string;
}

const CLASS_COLUMNS = 10;
const STUDENT_COLUMNS = 8;

/**
 * ສະຫຼຸບການມາຮຽນ — the school's attendance for one window, as two sheets.
 *
 * The first is a row per class with a ລວມ under it, for the office to sign and
 * file; the second names the students over the threshold, with their room, for
 * the follow-up the office makes on them. Figures are values rather than
 * formulas: unlike the district sheet nobody corrects them by hand, and the rate
 * cannot be a sum of the column above it anyway.
 */
export async function buildAttendanceSummaryWorkbook(
  rows: ClassAttendanceRow[],
  totals: AttendanceTotals,
  students: AttendanceAbsenceRow[],
  labels: AttendanceSummaryLabels,
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const pageSetup = REPORT_PAGE_SETUP;

  // ── 1. A row per class ───────────────────────────────────────────────────
  const classes = workbook.addWorksheet(labels.classSheet, { pageSetup });
  classes.columns = [
    { width: 6 },
    { width: 14 },
    ...Array.from({ length: CLASS_COLUMNS - 2 }, () => ({ width: 12 })),
  ];
  addHeading(classes, labels.schoolName, labels.title, CLASS_COLUMNS);
  await addCrest(workbook, classes, 42);
  classes.addRow([]);

  addHeaderRow(classes, [
    labels.number,
    labels.classroom,
    labels.headcount,
    labels.recorded,
    labels.late,
    labels.absentExcused,
    labels.absentUnexcused,
    labels.absentTotal,
    labels.overThreshold,
    labels.rate,
  ]);
  rows.forEach((row, index) => {
    const added = classes.addRow([
      index + 1,
      row.label,
      row.headcount,
      row.totalRecorded,
      row.lateRemainder,
      row.absentExcused,
      row.absentUnexcused,
      row.absentTotal,
      row.overThreshold,
      row.totalRecorded > 0 ? row.attendanceRate / 100 : '',
    ]);
    styleBody(added.getCell.bind(added), CLASS_COLUMNS, false);
  });
  const sum = classes.addRow([
    labels.total,
    '',
    totals.headcount,
    totals.totalRecorded,
    totals.lateRemainder,
    totals.absentExcused,
    totals.absentUnexcused,
    totals.absentTotal,
    totals.overThreshold,
    totals.totalRecorded > 0 ? totals.attendanceRate / 100 : '',
  ]);
  classes.mergeCells(sum.number, 1, sum.number, 2);
  styleBody(sum.getCell.bind(sum), CLASS_COLUMNS, true);

  addSignatures(classes, labels, CLASS_COLUMNS);
  addNotes(classes, [labels.note, labels.printedOn], CLASS_COLUMNS);

  // ── 2. The students over the line ────────────────────────────────────────
  const named = workbook.addWorksheet(labels.studentSheet, { pageSetup });
  named.columns = [
    { width: 6 },
    { width: 12 },
    { width: 28 },
    { width: 12 },
    ...Array.from({ length: STUDENT_COLUMNS - 4 }, () => ({ width: 13 })),
  ];
  addHeading(named, labels.schoolName, labels.studentTitle, STUDENT_COLUMNS);
  await addCrest(workbook, named, 42);
  named.addRow([]);

  addHeaderRow(named, [
    labels.number,
    labels.studentCode,
    labels.student,
    labels.classroom,
    labels.absentExcused,
    labels.absentUnexcused,
    labels.absentTotal,
    labels.rate,
  ]);
  if (students.length === 0) {
    const empty = named.addRow([labels.nobody]);
    named.mergeCells(empty.number, 1, empty.number, STUDENT_COLUMNS);
    empty.getCell(1).font = laoFont();
    empty.getCell(1).alignment = { horizontal: 'center' };
  }
  students.forEach((student, index) => {
    const added = named.addRow([
      index + 1,
      student.studentCode ?? '',
      student.studentNameLo ?? '',
      student.classroomName ?? '',
      student.absentExcused,
      student.absentUnexcused,
      student.absentTotal,
      student.totalRecorded > 0 ? student.attendanceRate / 100 : '',
    ]);
    styleBody(added.getCell.bind(added), STUDENT_COLUMNS, false, [3, 4]);
  });

  addNotes(named, [labels.note, labels.printedOn], STUDENT_COLUMNS);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * A ruled row: Lao in Phetsarath, figures in Times New Roman, the last column a
 * percentage. `textColumns` are the 1-based columns that hold words.
 */
function styleBody(
  cellAt: (column: number) => Cell,
  lastColumn: number,
  bold: boolean,
  textColumns: number[] = [1, 2],
) {
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = cellAt(column);
    const isText = textColumns.includes(column) && typeof cell.value === 'string';
    cell.border = THIN_BORDER;
    cell.font = isText ? laoFont({ bold }) : numberFont({ bold });
    cell.alignment = { horizontal: isText && column !== 1 ? 'left' : 'center', vertical: 'middle' };
  }
  cellAt(lastColumn).numFmt = '0.00%';
}

export function attendanceSummaryFileName(title: string): string {
  return `${safeFileName(title)}.xlsx`;
}
