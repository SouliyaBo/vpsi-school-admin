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
import type { ClassMonthSheet } from '../api';

/**
 * ໃບລາຍງານຜູ້ປົກຄອງ — the month's marks as the letter that goes home.
 *
 * The school sends one sheet per child at the end of each month, and keeps
 * it in Excel: a titled block with the subjects across, ກວດກາ on its own line
 * above ລວມ, a letter under each subject, the month's ລວມ / ຈຳນວນວິຊາ / ສະເລ່ຍ /
 * ເກຣດ down the right, the homeroom teacher's remark under each subject, and
 * the A–F scale as a note underneath. Built one student to a file, because the
 * office sends each one to its own parent — a class in one workbook would put
 * every child's marks in front of every other child's family. The block is
 * still written in a loop so the class-in-one-file form can come back if the
 * office ever wants to print rather than send.
 *
 * Every figure is the API's — the marks, the totals, the average and both kinds
 * of letter are written out as the class summary already has them. Nothing is
 * banded or averaged here, so the letter home cannot say something the screen
 * behind it does not.
 */

/** ຜ່ານ at half marks, as the API scores it — a mark under it prints red. */
const PASSING_MARK = 5;

const FAIL_FONT = numberFont({ color: { argb: 'FF9C0006' }, bold: true });

/**
 * Everything on the page that is a word rather than a figure — passed in
 * rather than translated here, for the same reason the class summary's are:
 * this file has no `t`, and a missing heading has to be a compile error.
 */
export interface ParentReportLabels {
  /** The worksheet's tab. */
  sheetName: string;
  /** ຜົນການຮຽນປະຈຳເດືອນ ກຸມພາ(02) ປະຈຳສົກຮຽນ 2025 - 2026 */
  title: string;
  studentName: string;
  classroom: string;
  rollNumber: string;

  /** The corner cell where the row labels and the subject headings meet. */
  corner: string;
  /** ຄະແນນກວດກາຕົວຈິງ (ເຕັມ 6) */
  testRow: string;
  /** ຄະແນນລວມ (ເຕັມ 10) */
  totalRow: string;
  /** ປະເພດຄະແນນແຕ່ລະວິຊາ */
  subjectGradeRow: string;
  /** ຄຳເຫັນຂອງຄູປະຈຳຫ້ອງຕໍ່ວິຊາ */
  remarkRow: string;

  // The four standing columns on the right.
  total: string;
  subjectCount: string;
  average: string;
  grade: string;
  /** What ຈຳນວນວິຊາ says while the month is short of a subject. */
  incompleteRow: (recorded: number, total: number) => string;

  /** ໝາຍເຫດ, and the scale it introduces — one line per letter. */
  note: string;
  gradeScaleLines: string[];
  printedOn: string;
}

/**
 * ຄຳເຫັນຂອງຄູປະຈຳຫ້ອງ — what the teacher writes under the marks.
 *
 * Typed at the moment of export rather than read from anywhere: the school
 * keeps no register of these, they are written fresh each month for each
 * child, and the file is the only place they go. `bySubject` is aligned with
 * the sheet's subjects, an empty string where there is nothing to say;
 * `overall` goes in the wider cell under the month's figures.
 */
export interface ParentReportRemarks {
  bySubject: string[];
  overall: string;
}

export interface ParentReportOptions {
  /** One student's letter; every enrolled student's when omitted. */
  studentId?: string;
  /** The teacher's remarks, by student id. */
  remarks?: Map<string, ParentReportRemarks>;
}

/**
 * The workbook for one student's month — or, with no `studentId`, every
 * enrolled student of the class, a page each.
 *
 * Students who have left the class are not given a page either way: the letter
 * goes home with a child who is still in the room, and the school files nothing
 * for the others beyond the row they keep on the summary.
 */
export async function buildParentReportWorkbook(
  sheet: ClassMonthSheet,
  labels: ParentReportLabels,
  { studentId, remarks }: ParentReportOptions = {},
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const subjectCount = sheet.subjects.length;
  /** The row labels, the subjects, then ລວມ / ຈຳນວນວິຊາ / ສະເລ່ຍ / ເກຣດ. */
  const firstSubject = 2;
  const totalColumn = firstSubject + subjectCount;
  const countColumn = totalColumn + 1;
  const averageColumn = totalColumn + 2;
  const gradeColumn = totalColumn + 3;
  const lastColumn = gradeColumn;

  const worksheet = workbook.addWorksheet(labels.sheetName, {
    pageSetup: {
      orientation: 'portrait',
      paperSize: 9, // A4
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    },
  });

  worksheet.columns = [
    { width: 34 },
    ...sheet.subjects.map(() => ({ width: 7.5 })),
    { width: 9 },
    { width: 9 },
    { width: 9 },
    { width: 9 },
  ];

  const className = classroomHeading(sheet.classroom);
  const students = sheet.rows.filter(
    (student) => student.isEnrolled && (studentId === undefined || student.studentId === studentId),
  );

  for (const [index, student] of students.entries()) {
    // ── The head of the letter ───────────────────────────────────────────
    const title = worksheet.addRow([labels.title]);
    worksheet.mergeCells(title.number, 1, title.number, lastColumn);
    title.getCell(1).font = laoFont({ size: 14, bold: true });
    title.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    title.height = 30;

    const who = worksheet.addRow([
      `${labels.studentName}: ${student.studentNameLo}`,
      ...Array.from({ length: subjectCount }, () => null),
      `${labels.classroom}: ${className}` +
        (student.rollNumber === null ? '' : `   ${labels.rollNumber} ${student.rollNumber}`),
    ]);
    worksheet.mergeCells(who.number, 1, who.number, totalColumn - 1);
    worksheet.mergeCells(who.number, totalColumn, who.number, lastColumn);
    who.height = 24;
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = who.getCell(column);
      cell.fill = HEADER_FILL;
      cell.font = laoFont({ bold: true });
      cell.alignment = { vertical: 'middle', horizontal: column === 1 ? 'left' : 'right' };
    }

    // The crest sits against the two heading rows, as on the letterhead.
    await addCrest(workbook, worksheet, 50, title.number);

    // ── Column headings — the subjects standing on end ───────────────────
    const heading = worksheet.addRow([
      labels.corner,
      ...sheet.subjects.map((subject) => subject.nameLo),
      labels.total,
      labels.subjectCount,
      labels.average,
      labels.grade,
    ]);
    heading.height = 120;
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = heading.getCell(column);
      cell.font = laoFont({ bold: true });
      cell.border = THIN_BORDER;
      cell.alignment =
        column === 1
          ? { horizontal: 'center', vertical: 'middle', wrapText: true }
          : { horizontal: 'center', vertical: 'middle', textRotation: 90, wrapText: true };
    }

    // ── The three mark rows, then the remark ─────────────────────────────
    const testRow = worksheet.addRow([labels.testRow, ...student.testScores]);
    const totalRow = worksheet.addRow([labels.totalRow, ...student.scores]);
    const gradeRow = worksheet.addRow([
      labels.subjectGradeRow,
      ...student.subjectGrades.map((grade) => grade ?? ''),
    ]);
    const remark = remarks?.get(student.studentId);
    const remarkRow = worksheet.addRow([
      labels.remarkRow,
      ...sheet.subjects.map((_, subjectIndex) => remark?.bySubject[subjectIndex] || null),
      remark?.overall || null,
    ]);
    remarkRow.height = 110;

    for (const row of [testRow, totalRow, gradeRow]) {
      row.height = 26;
      for (let column = 1; column <= lastColumn; column += 1) {
        const cell = row.getCell(column);
        cell.border = THIN_BORDER;
        cell.font = column === 1 ? laoFont({ bold: true }) : numberFont();
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        if (column >= firstSubject && column < totalColumn) {
          if (row !== gradeRow) cell.numFmt = '0.00';
          // The letter row goes red under a failing ລວມ, so the F reads as one.
          const total = student.scores[column - firstSubject];
          if (typeof total === 'number' && total < PASSING_MARK && row !== testRow) {
            cell.font = FAIL_FONT;
          }
        }
      }
    }

    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = remarkRow.getCell(column);
      cell.border = THIN_BORDER;
      cell.font = laoFont({ bold: column === 1, size: column === 1 ? 11 : 10 });
      // The label sits centred like the others; a remark reads from the top
      // of its cell, the way a hand-written one starts at the top of the box.
      cell.alignment =
        column === 1
          ? { horizontal: 'center', vertical: 'middle', wrapText: true }
          : { horizontal: 'left', vertical: 'top', wrapText: true };
    }
    // The remark is written across the right-hand block as one, not four
    // narrow cells; the subject cells stay separate so a word can go under each.
    worksheet.mergeCells(remarkRow.number, totalColumn, remarkRow.number, lastColumn);

    // ── The four standing figures, each spanning the three mark rows ─────
    const standing: [number, string | number | null][] = [
      [totalColumn, student.total],
      [
        countColumn,
        student.average === null
          ? null
          : student.isComplete
            ? subjectCount
            : labels.incompleteRow(student.subjectsRecorded, subjectCount),
      ],
      [averageColumn, student.average],
      [gradeColumn, student.grade ?? ''],
    ];
    for (const [column, value] of standing) {
      worksheet.mergeCells(testRow.number, column, gradeRow.number, column);
      const cell = testRow.getCell(column);
      cell.value = value;
      cell.font = numberFont({ bold: column !== countColumn });
      if (typeof value === 'number' && column !== countColumn) cell.numFmt = '0.00';
      if (typeof student.average === 'number' && student.average < PASSING_MARK) {
        if (column === averageColumn || column === gradeColumn) cell.font = FAIL_FONT;
      }
    }

    // ── ໝາຍເຫດ — the scale, as the paper prints it under the block ────────
    worksheet.addRow([]);
    const note = worksheet.addRow([labels.note]);
    note.getCell(1).font = laoFont({ bold: true });
    for (const line of labels.gradeScaleLines) {
      const row = worksheet.addRow([line]);
      row.getCell(1).font = numberFont();
      row.height = 16;
    }

    // No signature block: this letter is sent, not handed over and signed
    // for, and the teacher's word on it is the remark row above.
    worksheet.addRow([]);
    const printed = worksheet.addRow([labels.printedOn]);
    printed.getCell(1).font = laoFont({ size: 9, color: { argb: 'FF6B7280' } });

    // Each letter is its own page; the break goes after every one but the last.
    if (index < students.length - 1) {
      printed.addPageBreak();
      worksheet.addRow([]);
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * `ໃບລາຍງານຜູ້ປົກຄອງເດືອນກຸມພາ(02)／ມ.4／ກ／ຈຸທາມາດ ສີທາປັນຍາ.xlsx` — named like
 * the summary it is cut from, with the child's name last, so a folder of them
 * sorts by month, then class, then name, and a file forwarded on its own still
 * says whose it is.
 */
export function parentReportFileName(
  sheet: ClassMonthSheet,
  heading: string,
  studentName?: string,
): string {
  const classroom = classroomHeading(sheet.classroom).replace(/\//g, FILENAME_SLASH);
  const parts = [heading, classroom, ...(studentName ? [studentName] : [])];
  return `${safeFileName(parts.join(FILENAME_SLASH))}.xlsx`;
}

/**
 * Several letters at once, zipped — one `.xlsx` per student inside.
 *
 * A zip rather than one workbook or a burst of downloads: the letters have to
 * stay one file each, because each is forwarded to one family, and a browser
 * asked to save twenty files from one click either blocks them or asks twenty
 * times. One archive downloads once and unpacks into the same files the
 * per-student button gives, named the same way, so the office's folder does
 * not end up with two spellings of the same letter.
 *
 * `fileName` is asked per student so the archive uses the caller's naming —
 * the month, the class and the child's name in the office's own words.
 */
export async function buildParentReportArchive(
  sheet: ClassMonthSheet,
  labels: ParentReportLabels,
  studentIds: string[],
  remarks: Map<string, ParentReportRemarks>,
  fileName: (student: ClassMonthSheet['rows'][number]) => string,
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const archive = new JSZip();
  const chosen = new Set(studentIds);

  for (const student of sheet.rows) {
    if (!chosen.has(student.studentId) || !student.isEnrolled) continue;
    const workbook = await buildParentReportWorkbook(sheet, labels, {
      studentId: student.studentId,
      remarks,
    });
    archive.file(fileName(student), workbook);
  }

  return archive.generateAsync({ type: 'blob', compression: 'DEFLATE' });
}
