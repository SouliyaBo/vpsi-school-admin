import type { Cell, Row } from 'exceljs';
import { addCrest, laoFont, numberFont, safeFileName, THIN_BORDER } from '@/lib/workbook';
import type { BandTally, StandingBand, StandingStudent, StandingSubject } from '../api';
import type { BandChange } from './monthly-standing';
import {
  addHeaderRow,
  addHeading,
  addNotes,
  addSignatures,
  REPORT_PAGE_SETUP,
  type SignatureLabels,
} from './report-sheet';

/** What is on screen when the button is pressed — one class, or every class. */
export interface StandingWorkbookView {
  classes: { label: string; current: BandTally; previous: BandTally | null }[];
  total: { current: BandTally; previous: BandTally | null } | null;
  subjects: StandingSubject[];
  below: StandingStudent[];
  top: StandingStudent[];
  changes: { down: BandChange[]; up: BandChange[] } | null;
  roomLabel: (classroomId: string) => string;
}

/** Every string the workbook prints, resolved by the caller through `t`. */
export interface StandingWorkbookLabels extends SignatureLabels {
  schoolName: string;
  title: string;
  /** ຕາມຫ້ອງ, ລາຍວິຊາ, ນັກຮຽນຫຼຸດ 5, ນັກຮຽນ 7 ຂຶ້ນໄປ, ປ່ຽນກຸ່ມ. */
  sheets: Record<'classes' | 'subjects' | 'below' | 'top' | 'changes', string>;
  number: string;
  classroom: string;
  students: string;
  incomplete: string;
  decided: string;
  percent: string;
  before: string;
  total: string;
  subject: string;
  marked: string;
  failed: string;
  reachedTop: string;
  studentCode: string;
  student: string;
  failingSubjects: string;
  average: string;
  lowest: string;
  now: string;
  down: string;
  up: string;
  bandName: (band: StandingBand | null) => string;
  nobody: string;
  rules: string;
  printedOn: string;
}

/**
 * ສະຫຼຸບຜົນການຮຽນປະຈຳເດືອນ — the office's month on paper.
 *
 * A sheet for each view on the page: the classes with a ລວມ and room to sign,
 * the subjects, and the three lists of names. Shares are written as fractions
 * under a percentage format and marks to two places — the lists are about
 * which side of 5 or 7 a mark fell, and a 4.96 printed as 5.0 would hide it.
 */
export async function buildStandingWorkbook(
  view: StandingWorkbookView,
  labels: StandingWorkbookLabels,
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const comparing = view.classes.some((row) => row.previous !== null);
  const notes = [labels.rules, labels.printedOn];

  // ── 1. A row per class ───────────────────────────────────────────────────
  {
    const headers = [
      labels.number,
      labels.classroom,
      labels.students,
      labels.incomplete,
      labels.decided,
      ...(['top', 'middle', 'below'] as const).flatMap((band) => [
        `${labels.bandName(band)}`,
        `${labels.bandName(band)} ${labels.percent}`,
        ...(comparing ? [`${labels.bandName(band)} ${labels.percent} ${labels.before}`] : []),
      ]),
    ];
    const sheet = workbook.addWorksheet(labels.sheets.classes, { pageSetup: REPORT_PAGE_SETUP });
    sheet.columns = [{ width: 6 }, { width: 14 }, ...headers.slice(2).map(() => ({ width: 12 }))];
    addHeading(sheet, labels.schoolName, labels.title, headers.length);
    await addCrest(workbook, sheet, 42);
    sheet.addRow([]);
    addHeaderRow(sheet, headers);

    const figures = (current: BandTally, previous: BandTally | null) => [
      current.students,
      current.incomplete,
      current.decided,
      ...(['top', 'middle', 'below'] as const).flatMap((band) => [
        current[band],
        share(current[`${band}Percent`]),
        ...(comparing ? [share(previous?.[`${band}Percent`] ?? null)] : []),
      ]),
    ];
    // After ລ/ດ, ຫ້ອງ, ນັກຮຽນ, ຍັງບໍ່ຄົບ and ຄິດ %: per band a count, its share,
    // and last month's share when comparing.
    const step = comparing ? 3 : 2;
    const percentColumns = [0, 1, 2].flatMap((band) => {
      const first = 6 + band * step;
      return comparing ? [first + 1, first + 2] : [first + 1];
    });

    view.classes.forEach((row, index) => {
      const added = sheet.addRow([index + 1, row.label, ...figures(row.current, row.previous)]);
      style(added, headers.length, { text: [2], percent: percentColumns });
    });
    if (view.total) {
      const sum = sheet.addRow([
        labels.total,
        '',
        ...figures(view.total.current, view.total.previous),
      ]);
      sheet.mergeCells(sum.number, 1, sum.number, 2);
      style(sum, headers.length, { text: [1], percent: percentColumns, bold: true });
    }
    addSignatures(sheet, labels, headers.length);
    addNotes(sheet, notes, headers.length);
  }

  // ── 2. A row per subject ─────────────────────────────────────────────────
  {
    const headers = [
      labels.number,
      labels.subject,
      labels.marked,
      labels.failed,
      `${labels.failed} ${labels.percent}`,
      ...(comparing ? [`${labels.failed} ${labels.percent} ${labels.before}`] : []),
      labels.reachedTop,
      `${labels.reachedTop} ${labels.percent}`,
      ...(comparing ? [`${labels.reachedTop} ${labels.percent} ${labels.before}`] : []),
    ];
    const sheet = workbook.addWorksheet(labels.sheets.subjects, { pageSetup: REPORT_PAGE_SETUP });
    sheet.columns = [{ width: 6 }, { width: 26 }, ...headers.slice(2).map(() => ({ width: 13 }))];
    addHeading(sheet, labels.schoolName, labels.title, headers.length);
    await addCrest(workbook, sheet, 42);
    sheet.addRow([]);
    addHeaderRow(sheet, headers);
    const percentColumns = comparing ? [5, 6, 8, 9] : [5, 7];

    view.subjects.forEach((subject, index) => {
      const added = sheet.addRow([
        index + 1,
        subject.nameLo,
        subject.current.marked,
        subject.current.failed,
        share(subject.current.failedPercent),
        ...(comparing ? [share(subject.previous?.failedPercent ?? null)] : []),
        subject.current.top,
        share(subject.current.topPercent),
        ...(comparing ? [share(subject.previous?.topPercent ?? null)] : []),
      ]);
      style(added, headers.length, { text: [2], percent: percentColumns });
    });
    addNotes(sheet, notes, headers.length);
  }

  // ── 3. Below 5 ───────────────────────────────────────────────────────────
  {
    const headers = [
      labels.number,
      labels.studentCode,
      labels.student,
      labels.classroom,
      labels.failingSubjects,
      ...(comparing ? [labels.before] : []),
    ];
    const sheet = workbook.addWorksheet(labels.sheets.below, { pageSetup: REPORT_PAGE_SETUP });
    sheet.columns = [
      { width: 6 },
      { width: 12 },
      { width: 28 },
      { width: 12 },
      { width: 48 },
      { width: 12 },
    ];
    addHeading(sheet, labels.schoolName, `${labels.sheets.below} — ${labels.title}`, headers.length);
    await addCrest(workbook, sheet, 42);
    sheet.addRow([]);
    addHeaderRow(sheet, headers);
    if (view.below.length === 0) addNobody(sheet.addRow([labels.nobody]), headers.length);
    view.below.forEach((student, index) => {
      const added = sheet.addRow([
        index + 1,
        student.studentCode,
        student.studentNameLo,
        view.roomLabel(student.classroomId),
        student.failing.map((entry) => `${entry.nameLo} ${entry.score.toFixed(2)}`).join(', '),
        ...(comparing ? [labels.bandName(student.previousBand)] : []),
      ]);
      style(added, headers.length, { text: [3, 4, 5, 6] });
    });
    addNotes(sheet, notes, headers.length);
  }

  // ── 4. 7 and above in every subject ──────────────────────────────────────
  {
    const headers = [
      labels.number,
      labels.studentCode,
      labels.student,
      labels.classroom,
      labels.average,
      labels.lowest,
      ...(comparing ? [labels.before] : []),
    ];
    const sheet = workbook.addWorksheet(labels.sheets.top, { pageSetup: REPORT_PAGE_SETUP });
    sheet.columns = [
      { width: 6 },
      { width: 12 },
      { width: 28 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
    ];
    addHeading(sheet, labels.schoolName, `${labels.sheets.top} — ${labels.title}`, headers.length);
    await addCrest(workbook, sheet, 42);
    sheet.addRow([]);
    addHeaderRow(sheet, headers);
    if (view.top.length === 0) addNobody(sheet.addRow([labels.nobody]), headers.length);
    view.top.forEach((student, index) => {
      const added = sheet.addRow([
        index + 1,
        student.studentCode,
        student.studentNameLo,
        view.roomLabel(student.classroomId),
        student.average ?? '',
        student.lowest ?? '',
        ...(comparing ? [labels.bandName(student.previousBand)] : []),
      ]);
      style(added, headers.length, { text: [3, 4, 7], mark: [5, 6] });
    });
    addNotes(sheet, notes, headers.length);
  }

  // ── 5. Who changed band ──────────────────────────────────────────────────
  if (view.changes) {
    const headers = [
      labels.number,
      labels.studentCode,
      labels.student,
      labels.classroom,
      labels.before,
      labels.now,
    ];
    const sheet = workbook.addWorksheet(labels.sheets.changes, { pageSetup: REPORT_PAGE_SETUP });
    sheet.columns = [{ width: 6 }, { width: 12 }, { width: 28 }, { width: 12 }, { width: 14 }, { width: 14 }];
    addHeading(sheet, labels.schoolName, `${labels.sheets.changes} — ${labels.title}`, headers.length);
    await addCrest(workbook, sheet, 42);

    for (const [heading, changes] of [
      [labels.down, view.changes.down],
      [labels.up, view.changes.up],
    ] as const) {
      sheet.addRow([]);
      const title = sheet.addRow([heading]);
      sheet.mergeCells(title.number, 1, title.number, headers.length);
      title.getCell(1).font = laoFont({ bold: true });
      addHeaderRow(sheet, headers);
      if (changes.length === 0) addNobody(sheet.addRow([labels.nobody]), headers.length);
      changes.forEach((change, index) => {
        const added = sheet.addRow([
          index + 1,
          change.student.studentCode,
          change.student.studentNameLo,
          view.roomLabel(change.student.classroomId),
          labels.bandName(change.from),
          labels.bandName(change.to),
        ]);
        style(added, headers.length, { text: [3, 4, 5, 6] });
      });
    }
    addNotes(sheet, notes, headers.length);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** A share in percent as Excel wants it — a fraction — or blank over nobody. */
function share(percent: number | null): number | string {
  return percent === null ? '' : percent / 100;
}

/**
 * A ruled row: Lao in Phetsarath, figures in Times New Roman. `text` are the
 * 1-based columns that hold words, `percent` and `mark` the formatted figures.
 */
function style(
  row: Row,
  lastColumn: number,
  options: { text?: number[]; percent?: number[]; mark?: number[]; bold?: boolean },
) {
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell: Cell = row.getCell(column);
    const isText = (options.text ?? []).includes(column) && typeof cell.value === 'string';
    cell.border = THIN_BORDER;
    cell.font = isText ? laoFont({ bold: options.bold }) : numberFont({ bold: options.bold });
    cell.alignment = { horizontal: isText ? 'left' : 'center', vertical: 'middle', wrapText: isText };
    if (options.percent?.includes(column)) cell.numFmt = '0.00%';
    if (options.mark?.includes(column)) cell.numFmt = '0.00';
  }
}

function addNobody(row: Row, lastColumn: number) {
  row.worksheet.mergeCells(row.number, 1, row.number, lastColumn);
  row.getCell(1).font = laoFont();
  row.getCell(1).alignment = { horizontal: 'center' };
}

export function standingFileName(title: string): string {
  return `${safeFileName(title)}.xlsx`;
}
