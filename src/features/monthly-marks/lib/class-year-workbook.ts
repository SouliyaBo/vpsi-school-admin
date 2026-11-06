import type { Worksheet } from 'exceljs';
import { classroomHeading } from '@/features/classrooms/api';
import { HEADER_FILL, laoFont, numberFont, safeFileName, THIN_BORDER } from '@/lib/workbook';
import { isBelowPass, type ClassYearRow, type ClassYearSheet, type YearRegisters } from '../api';

/**
 * ໝົດປີ ທັງຫ້ອງ as the office's year workbook — one block per room, stacked down
 * one sheet, each on its own printed page.
 *
 * The layout is the school's own sheet: ລ/ດ · ລ/ຕ · ເພດ · ຊື່ · ນາມສະກຸນ · ຊື່ຫຼິ້ນ,
 * then every month and exam of the year left to right, each a mark per subject
 * with ຄະແນນຖືກຕັດ and ວັນຂາດ after it; then ພາກ I, ພາກ II and ໝົດປີ, which the
 * paper left to be worked out by hand. The heading is the subject of whoever
 * exports it — each teacher keeps a copy under their own subject's name — and
 * that subject's columns are shaded so it can be found in a row of eight.
 *
 * Nothing is recomputed here: every figure is the API's.
 */

export interface ClassYearLabels {
  /** The yellow band: the chosen subject's name and the year. */
  title: (sheet: ClassYearSheet) => string;
  /** `ຫ້ອງ ມ.1/ກ: ອຈ ນູລີ`. */
  classroom: (classroom: string, teacher: string | null) => string;
  rollNumber: string;
  studentCode: string;
  gender: string;
  firstName: string;
  lastName: string;
  nickname: string;
  female: string;
  male: string;
  deducted: string;
  absences: string;
  month: (month: number) => string;
  exam: (semester: string) => string;
  term: (semester: string) => string;
  annual: string;
  /** `ລວມ 18 ຄົນ · ຍິງ 10 · ຊາຍ 8`. */
  footer: (students: number, female: number) => string;
}

/** One stretch of the year: a month, an exam, a term or the year itself. */
export interface YearPeriod {
  heading: string;
  /** A figure per subject, in `subjects` order. */
  scores: (row: ClassYearRow) => (number | null)[];
  /** `null` for an exam, whose register columns the school leaves blank. */
  registers: ((row: ClassYearRow) => YearRegisters) | null;
}

/** The periods of the year in the order the sheet reads them. */
export function yearPeriods(sheet: ClassYearSheet, labels: ClassYearLabels): YearPeriod[] {
  const periods: YearPeriod[] = [];
  sheet.semesters.forEach((semester, term) => {
    semester.months.forEach((month, position) => {
      periods.push({
        heading: labels.month(month),
        scores: (row) => row.terms[term]?.months[position]?.scores ?? [],
        registers: (row) => row.terms[term]?.months[position] ?? EMPTY,
      });
    });
    periods.push({
      heading: labels.exam(semester.nameLo),
      scores: (row) => row.terms[term]?.exam ?? [],
      registers: null,
    });
  });
  sheet.semesters.forEach((semester, term) => {
    periods.push({
      heading: labels.term(semester.nameLo),
      scores: (row) => row.terms[term]?.marks ?? [],
      registers: (row) => row.terms[term] ?? EMPTY,
    });
  });
  periods.push({
    heading: labels.annual,
    scores: (row) => row.annual,
    registers: (row) => row,
  });
  return periods;
}

const EMPTY: YearRegisters = { deducted: null, absences: null };

const IDENTITY_COLUMNS = 6;
const TITLE_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFFFFF66' },
};
/** The exporting teacher's own subject. */
const CHOSEN_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFFFF2CC' },
};
const LEFT_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFF2F2F2' },
};
const FAIL_FONT = numberFont({ color: { argb: 'FF9C0006' }, bold: true });
const PERIOD_BORDER = { ...THIN_BORDER, left: { style: 'medium' as const } };

/**
 * One workbook, one sheet, every room given — in the order given.
 *
 * `chosenSubject` is matched by name, because a subject is a record per grade:
 * ຄະນິດສາດ at ມ.1 and ຄະນິດສາດ at ມ.4 are two ids and one subject.
 */
export async function buildClassYearWorkbook(
  sheets: ClassYearSheet[],
  labels: ClassYearLabels,
  chosenSubject: string | null,
  sheetName: string,
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName.slice(0, 31) || 'Sheet1', {
    pageSetup: {
      // A3 is OOXML's paper size 8, which exceljs's enum leaves out. Some 110
      // columns fitted to one page print too small to read, so a room runs two
      // pages across, the names repeated on the second.
      paperSize: 8 as never,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 2,
      fitToHeight: 0,
      printTitlesColumn: 'A:F',
      // A room's two halves print one after the other, not every room's left half first.
      pageOrder: 'overThenDown',
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    },
  });

  const widest = Math.max(0, ...sheets.map((sheet) => markColumns(sheet, labels)));
  [5, 7, 6, 14, 14, 11].forEach((width, index) => {
    worksheet.getColumn(index + 1).width = width;
  });
  for (let column = IDENTITY_COLUMNS + 1; column <= IDENTITY_COLUMNS + widest; column += 1) {
    worksheet.getColumn(column).width = 5.5;
  }

  sheets.forEach((sheet, index) => {
    if (index > 0) {
      // Each room starts its own printed page.
      worksheet.addRow([]);
      worksheet.lastRow?.addPageBreak();
    }
    writeBlock(worksheet, sheet, labels, chosenSubject);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Every period carries its subjects and the two register columns, exams included. */
function markColumns(sheet: ClassYearSheet, labels: ClassYearLabels): number {
  return yearPeriods(sheet, labels).length * (sheet.subjects.length + 2);
}

function writeBlock(
  worksheet: Worksheet,
  sheet: ClassYearSheet,
  labels: ClassYearLabels,
  chosenSubject: string | null,
) {
  const periods = yearPeriods(sheet, labels);
  const span = sheet.subjects.length + 2;
  const last = IDENTITY_COLUMNS + periods.length * span;

  const title = worksheet.addRow([labels.title(sheet)]);
  worksheet.mergeCells(title.number, 1, title.number, last);
  title.height = 24;
  Object.assign(title.getCell(1), {
    font: laoFont({ bold: true, size: 14 }),
    alignment: { horizontal: 'center', vertical: 'middle' },
    fill: TITLE_FILL,
    border: THIN_BORDER,
  });

  // ຫ້ອງ … over the identity columns, the period names over theirs.
  const bands = worksheet.addRow([]);
  bands.height = 22;
  bands.getCell(1).value = labels.classroom(
    classroomHeading(sheet.classroom),
    sheet.classroom.homeroomTeacherName,
  );
  worksheet.mergeCells(bands.number, 1, bands.number, IDENTITY_COLUMNS);
  const headings = worksheet.addRow([]);
  const under = worksheet.addRow([]);
  headings.height = 24;
  under.height = 90;

  [
    labels.rollNumber,
    labels.studentCode,
    labels.gender,
    labels.firstName,
    labels.lastName,
    labels.nickname,
  ].forEach((text, index) => {
    headings.getCell(index + 1).value = text;
    worksheet.mergeCells(headings.number, index + 1, under.number, index + 1);
  });

  periods.forEach((period, index) => {
    const start = IDENTITY_COLUMNS + 1 + index * span;
    bands.getCell(start).value = period.heading;
    worksheet.mergeCells(bands.number, start, bands.number, start + span - 1);
    const columns = [
      ...sheet.subjects.map((subject) => subject.nameLo),
      labels.deducted,
      labels.absences,
    ];
    columns.forEach((text, offset) => {
      headings.getCell(start + offset).value = text;
      worksheet.mergeCells(headings.number, start + offset, under.number, start + offset);
    });
  });

  for (const row of [bands, headings, under]) {
    for (let column = 1; column <= last; column += 1) {
      const cell = row.getCell(column);
      const isMark = column > IDENTITY_COLUMNS;
      cell.font = laoFont({ bold: true, size: isMark ? 9 : 11 });
      cell.border =
        isMark && (column - IDENTITY_COLUMNS - 1) % span === 0 ? PERIOD_BORDER : THIN_BORDER;
      cell.fill = HEADER_FILL;
      cell.alignment =
        isMark && row !== bands
          ? { horizontal: 'center', vertical: 'middle', textRotation: 90, wrapText: true }
          : { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  }

  sheet.rows.forEach((student, index) => {
    const values: (string | number | null)[] = [
      index + 1,
      student.studentCode,
      student.gender === 'female' ? labels.female : student.gender === 'male' ? labels.male : null,
      student.firstNameLo,
      student.lastNameLo,
      student.nickname,
    ];
    for (const period of periods) {
      const scores = period.scores(student);
      values.push(...sheet.subjects.map((_, position) => scores[position] ?? null));
      const registers = period.registers?.(student) ?? EMPTY;
      values.push(registers.deducted, registers.absences);
    }

    const line = worksheet.addRow(values);
    line.height = 20;
    for (let column = 1; column <= last; column += 1) {
      const cell = line.getCell(column);
      const offset = column - IDENTITY_COLUMNS - 1;
      const position = offset % span;
      cell.border = column > IDENTITY_COLUMNS && position === 0 ? PERIOD_BORDER : THIN_BORDER;
      cell.alignment = {
        horizontal: column === 4 || column === 5 || column === 6 ? 'left' : 'center',
        vertical: 'middle',
      };
      if (column <= IDENTITY_COLUMNS) {
        cell.font = column <= 2 ? numberFont() : laoFont();
      } else if (position < sheet.subjects.length) {
        const subject = sheet.subjects[position];
        cell.numFmt = '0.00';
        const value = typeof cell.value === 'number' ? cell.value : null;
        cell.font = isBelowPass(value, subject.fullMark) ? FAIL_FONT : numberFont();
        if (chosenSubject && subject.nameLo === chosenSubject) cell.fill = CHOSEN_FILL;
      } else {
        cell.numFmt = '0';
        cell.font = numberFont();
      }
      if (!student.isEnrolled) cell.fill = LEFT_FILL;
    }
  });

  const female = sheet.classSize.female;
  const footer = worksheet.addRow([labels.footer(sheet.classSize.students, female)]);
  worksheet.mergeCells(footer.number, 1, footer.number, IDENTITY_COLUMNS);
  footer.getCell(1).font = laoFont({ bold: true });
}

/** `ໝົດປີ ທັງຫ້ອງ ມ.1／ກ.xlsx`, or one name for the whole school. */
export function classYearFileName(base: string, sheet: ClassYearSheet | null): string {
  const room = sheet ? ` ${classroomHeading(sheet.classroom)}` : '';
  return `${safeFileName(`${base}${room}`)}.xlsx`;
}
