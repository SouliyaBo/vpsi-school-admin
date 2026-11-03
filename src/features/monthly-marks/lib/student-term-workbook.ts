import type { Grade } from '@/types/enums';
import { classroomHeading } from '@/features/classrooms/api';
import {
  addCrest,
  FILENAME_SLASH,
  HEADER_FILL,
  laoFont,
  numberFont,
  safeFileName,
  THIN_BORDER,
} from '@/lib/workbook';
import { isBelowPass, type StudentMonthlySheet } from '../api';

/**
 * ຜົນການຮຽນພາກຮຽນ — one child's term on one landscape page, as the office's own
 * sheet lays it out.
 *
 * Months down the side, then ສະເລ່ຍ 3 ເດືອນ, ສອບເສັງ and ພາກຮຽນ; the subjects
 * across, standing on end; ລວມ / ຈຳນວນວິຊາ / ສະເລ່ຍ / ຈັດປະເພດ after them; the
 * days missed and the conduct points beside each line; and a column the
 * homeroom teacher writes their comment into by hand once it is printed.
 *
 * Every mark and every ລວມ / ສະເລ່ຍ / ເກຣດ is the API's — this file only lays
 * them out. The two borrowed registers are the only figures put together here,
 * and only by adding: a month's absences come from the roll asked for that
 * month, and the conduct points from the ledger's dated entries.
 */

/** Excel's own "Bad" red, which is what the school's failing marks are set in. */
const FAIL_FONT = numberFont({ color: { argb: 'FF9C0006' } });

/** The green the office's sheet runs the student's line on. */
const BAR_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFC6E0B4' },
};

/** Words on the sheet, passed in so the file comes out in the screen's language. */
export interface StudentTermLabels {
  schoolName: string;
  title: string;
  sheetName: string;
  /** `ຊື່ ແລະ ນາມສະກຸນ: … (ລ.ຕ: …)` */
  student: string;
  /** `ຫ້ອງຮຽນ …` */
  classroom: string;
  /** `ລວມ … ຄົນ, ຍິງ … ຄົນ`, or `null` from an API that does not count the room. */
  classSize: string | null;

  corner: string;
  total: string;
  subjectCount: string;
  average: string;
  grade: string;
  absentTotal: string;
  absentUnexcused: string;
  deducted: string;
  remaining: string;
  comment: string;

  /** One per month of the term, in the order of `sheet.months`. */
  months: string[];
  threeMonth: string;
  exam: string;
  term: string;

  placeAndDate: string;
  director: string;
  homeroomTeacher: string;
}

/** Days off and conduct points for one line of the sheet; `null` prints empty. */
export interface LineRegisters {
  absentTotal: number | null;
  absentUnexcused: number | null;
  deducted: number | null;
  remaining: number | null;
}

/** One line of the conduct ledger, as the API dates it (`yyyy-MM-dd`). */
export interface LedgerEntry {
  date: string;
  points: number;
}

/**
 * The register columns for every line of the sheet: one per month, then 3 ເດືອນ,
 * ສອບເສັງ and ພາກຮຽນ.
 *
 * ຖືກຕັດ is what the month's entries took; ເຫຼືອ is the year's 100 less every
 * entry up to the end of that month — the budget runs over the whole school
 * year, so September's points still count against November. The months are
 * ordered by where they fall in the school year, which starts in `startMonth`:
 * a term has no year on its month numbers, and a school year holds each month
 * once.
 *
 * 3 ເດືອນ and ພາກຮຽນ add the months up and keep the last ເຫຼືອ. ສອບເສັງ is a day,
 * not a stretch of the term, so it misses nothing and loses nothing, and stands
 * at the same ເຫຼືອ — which is how the office's sheet fills it.
 *
 * @param absences Aligned with `months`; `null` for the roll not read at all.
 * @param conduct `null` when the ledger was not read — no right to it.
 */
export function termRegisters(
  months: number[],
  startMonth: number,
  absences: ({ total: number; unexcused: number } | null)[] | null,
  conduct: { baseScore: number; entries: LedgerEntry[] } | null,
): {
  months: LineRegisters[];
  threeMonth: LineRegisters;
  exam: LineRegisters;
  term: LineRegisters;
} {
  const position = (month: number) => (month - startMonth + 12) % 12;
  const monthOf = (date: string) => Number(date.slice(5, 7));

  const lines = months.map((month, index): LineRegisters => {
    const roll = absences?.[index] ?? null;
    const taken = conduct
      ? conduct.entries
          .filter((entry) => monthOf(entry.date) === month)
          .reduce((sum, entry) => sum + entry.points, 0)
      : null;
    const takenToDate = conduct
      ? conduct.entries
          .filter((entry) => position(monthOf(entry.date)) <= position(month))
          .reduce((sum, entry) => sum + entry.points, 0)
      : null;
    return {
      absentTotal: roll?.total ?? null,
      absentUnexcused: roll?.unexcused ?? null,
      deducted: taken,
      remaining: conduct && takenToDate !== null ? conduct.baseScore - takenToDate : null,
    };
  });

  const sum = (pick: (line: LineRegisters) => number | null) => {
    const figures = lines.map(pick).filter((value): value is number => value !== null);
    return figures.length > 0 ? figures.reduce((total, value) => total + value, 0) : null;
  };
  const lastRemaining = lines.length > 0 ? lines[lines.length - 1].remaining : null;
  const whole: LineRegisters = {
    absentTotal: sum((line) => line.absentTotal),
    absentUnexcused: sum((line) => line.absentUnexcused),
    deducted: sum((line) => line.deducted),
    remaining: lastRemaining,
  };

  return {
    months: lines,
    threeMonth: whole,
    exam: {
      absentTotal: absences ? 0 : null,
      absentUnexcused: absences ? 0 : null,
      deducted: conduct ? 0 : null,
      remaining: lastRemaining,
    },
    term: whole,
  };
}

/** One line's ລວມ / ຈຳນວນວິຊາ / ສະເລ່ຍ / ເກຣດ, as the API works them out. */
interface Standing {
  total: number | null;
  subjectsRecorded: number;
  average: number | null;
  grade: Grade | null;
}

const NO_STANDING: Standing = { total: null, subjectsRecorded: 0, average: null, grade: null };

export async function buildStudentTermWorkbook(
  sheet: StudentMonthlySheet,
  labels: StudentTermLabels,
  registers: ReturnType<typeof termRegisters>,
  homeroomTeacherName: string | null,
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const subjectCount = sheet.subjects.length;
  const firstSubject = 2;
  const totalColumn = firstSubject + subjectCount;
  const averageColumn = totalColumn + 2;
  const gradeColumn = totalColumn + 3;
  const absentColumn = gradeColumn + 1;
  const commentColumn = absentColumn + 4;
  const lastColumn = commentColumn;

  const worksheet = workbook.addWorksheet(labels.sheetName, {
    pageSetup: {
      orientation: 'landscape',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  worksheet.columns = [
    { width: 24 },
    ...sheet.subjects.map(() => ({ width: 6.5 })),
    { width: 9 },
    { width: 6 },
    { width: 8 },
    { width: 6 },
    { width: 5.5 },
    { width: 5.5 },
    { width: 5.5 },
    { width: 5.5 },
    { width: 30 },
  ];

  // ── The head of the page ─────────────────────────────────────────────────
  const heading = (text: string, size: number) => {
    const row = worksheet.addRow([text]);
    worksheet.mergeCells(row.number, 1, row.number, lastColumn);
    row.getCell(1).font = laoFont({ size, bold: true });
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.height = size + 10;
    return row;
  };
  heading(labels.schoolName, 13);
  heading(labels.title, 13);
  await addCrest(workbook, worksheet, 44);

  // The student's line, in three parts across the page as the office runs it.
  const bar = worksheet.addRow([]);
  bar.height = 22;
  const nameEnd = Math.max(firstSubject, totalColumn - 2);
  const classEnd = gradeColumn;
  const parts: [number, number, string][] = [
    [1, nameEnd, labels.student],
    [nameEnd + 1, classEnd, labels.classroom],
    [classEnd + 1, lastColumn, labels.classSize ?? ''],
  ];
  for (const [from, to, text] of parts) {
    worksheet.mergeCells(bar.number, from, bar.number, to);
    bar.getCell(from).value = text;
  }
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = bar.getCell(column);
    cell.fill = BAR_FILL;
    cell.border = THIN_BORDER;
    cell.font = laoFont({ bold: true });
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // ── Column headings, the narrow ones standing on end ─────────────────────
  const head = worksheet.addRow([
    labels.corner,
    ...sheet.subjects.map((subject) => subject.nameLo),
    labels.total,
    labels.subjectCount,
    labels.average,
    labels.grade,
    labels.absentTotal,
    labels.absentUnexcused,
    labels.deducted,
    labels.remaining,
    labels.comment,
  ]);
  // Tall enough for ຄະແນນຄຸນສົມບັດເຫຼືອ to stand on end without wrapping.
  head.height = 130;
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = head.getCell(column);
    cell.font = laoFont({ bold: true });
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
    const flat = column === 1 || column === commentColumn;
    cell.alignment = {
      horizontal: 'center',
      vertical: 'middle',
      wrapText: true,
      ...(flat ? {} : { textRotation: 90 }),
    };
  }

  // ── The lines ────────────────────────────────────────────────────────────
  const rows = sheet.subjectRows;
  const summary = sheet.summary;
  const lines: {
    label: string;
    scores: (number | null)[];
    standing: Standing;
    registers: LineRegisters;
  }[] = [
    ...sheet.months.map((month, index) => {
      const entry = sheet.monthly.find((candidate) => candidate.month === month);
      return {
        label: labels.months[index] ?? String(month),
        scores: rows.map((row) => row.monthScores[index] ?? null),
        standing: entry
          ? {
              total: entry.total,
              subjectsRecorded: entry.subjectsRecorded,
              average: entry.average,
              grade: entry.grade,
            }
          : NO_STANDING,
        registers: registers.months[index],
      };
    }),
    {
      label: labels.threeMonth,
      scores: rows.map((row) => row.threeMonth),
      standing: summary.threeMonth ?? NO_STANDING,
      registers: registers.threeMonth,
    },
    {
      label: labels.exam,
      scores: rows.map((row) => row.examScore),
      standing: summary.exam ?? NO_STANDING,
      registers: registers.exam,
    },
    {
      label: labels.term,
      scores: rows.map((row) => row.semesterMark),
      standing: {
        total: summary.termTotal ?? null,
        subjectsRecorded: summary.termSubjectsRecorded ?? 0,
        average: summary.termAverage,
        grade: summary.termGrade ?? null,
      },
      registers: registers.term,
    },
  ];

  const firstLine = head.number + 1;
  for (const line of lines) {
    const row = worksheet.addRow([
      line.label,
      ...line.scores,
      line.standing.total,
      line.standing.total === null ? null : line.standing.subjectsRecorded,
      line.standing.average,
      line.standing.grade ?? '',
      line.registers.absentTotal,
      line.registers.absentUnexcused,
      line.registers.deducted,
      line.registers.remaining,
    ]);
    row.height = 24;
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = row.getCell(column);
      cell.border = THIN_BORDER;
      cell.font = column === 1 ? laoFont({ bold: true }) : numberFont();
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
    // Marks to two places, as the screen shows them; failing marks in red,
    // against the subject's own pass line — 4.5 for a subject out of 9.
    for (let column = firstSubject; column < totalColumn; column += 1) {
      const cell = row.getCell(column);
      cell.numFmt = '0.00';
      const score = line.scores[column - firstSubject];
      if (isBelowPass(score ?? null, sheet.subjects[column - firstSubject]?.fullMark)) {
        cell.font = FAIL_FONT;
      }
    }
    row.getCell(totalColumn).numFmt = '0.00';
    row.getCell(averageColumn).numFmt = '0.00';
    row.getCell(averageColumn).font = isBelowPass(line.standing.average)
      ? { ...FAIL_FONT, bold: true }
      : numberFont({ bold: true });
    row.getCell(gradeColumn).font = numberFont({ bold: true });
  }
  const lastLine = firstLine + lines.length - 1;

  // ຄຳເຫັນ is one box down the whole table, left for the homeroom teacher's pen.
  worksheet.mergeCells(firstLine, commentColumn, lastLine, commentColumn);

  // ── Place, date and the two signatures ───────────────────────────────────
  worksheet.addRow([]);
  const signatureStart = Math.max(firstSubject + 1, commentColumn - 6);
  const dateLine = worksheet.addRow([]);
  worksheet.mergeCells(dateLine.number, signatureStart, dateLine.number, lastColumn);
  dateLine.getCell(signatureStart).value = labels.placeAndDate;
  dateLine.getCell(signatureStart).font = laoFont();
  dateLine.getCell(signatureStart).alignment = { horizontal: 'center' };

  const titles = worksheet.addRow([]);
  worksheet.mergeCells(titles.number, 1, titles.number, firstSubject + 2);
  worksheet.mergeCells(titles.number, signatureStart, titles.number, lastColumn);
  titles.getCell(1).value = labels.director;
  titles.getCell(signatureStart).value = labels.homeroomTeacher;
  for (const column of [1, signatureStart]) {
    titles.getCell(column).font = laoFont({ bold: true });
    titles.getCell(column).alignment = { horizontal: 'center' };
  }

  // Room to sign, then the homeroom teacher's name under their signature.
  for (let index = 0; index < 3; index += 1) worksheet.addRow([]).height = 20;
  const names = worksheet.addRow([]);
  worksheet.mergeCells(names.number, signatureStart, names.number, lastColumn);
  names.getCell(signatureStart).value = homeroomTeacherName ?? '';
  names.getCell(signatureStart).font = laoFont();
  names.getCell(signatureStart).alignment = { horizontal: 'center' };

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** `ຜົນການຮຽນພາກຮຽນທີ 1／ມ.3／ກ／ລັດມິດາ ວິຈິດວົງສາ.xlsx` */
export function studentTermFileName(
  sheet: StudentMonthlySheet,
  heading: string,
  studentName: string,
): string {
  const classroom = sheet.classroom
    ? classroomHeading(sheet.classroom).replace(/\//g, FILENAME_SLASH)
    : '';
  return `${safeFileName([heading, classroom, studentName].filter(Boolean).join(FILENAME_SLASH))}.xlsx`;
}
