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
 * ສະຫຼຸບປະຈຳເດືອນ as the office's own workbook.
 *
 * The school already keeps this sheet in Excel — one block per class, marks
 * across, ລວມ / ສະເລ່ຍ / ລຳດັບ down the right, ຄະແນນຄຸນສົມບັດ and ວັນຂາດ after
 * them, a counted summary underneath and two signature lines at the foot — and
 * the office goes on pasting it into letters and printing it after the year is
 * closed. Exporting the same shape is what makes the screen a replacement for
 * that workbook rather than a second place the same marks live.
 *
 * Three registers meet on this page and only here: the marks, the discipline
 * ledger and the roll. Nothing is recomputed from any of them — every mark,
 * ລວມ, ສະເລ່ຍ, ເກຣດ, ລຳດັບ, balance and absence count is written out as its own
 * module scored it — so the workbook cannot disagree with the screens behind it.
 *
 * The two borrowed columns are counted over different windows, because the
 * school reads them over different ones: ຄະແນນຄຸນສົມບັດ is a year's budget of 100
 * carried forward through both terms, and ວັນຂາດ is the month the sheet is
 * headed with.
 */

/** ຜ່ານ at half marks, as the API scores it — the red cells are drawn on it. */
const PASSING_MARK = 5;

/** Excel's own "Bad" cell style, which is what the school's red blocks mean. */
const FAIL_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFFFC7CE' },
};
const FAIL_FONT = numberFont({ color: { argb: 'FF9C0006' }, bold: true });

const RANK_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFDCE6F1' },
};
/** A student who has left the class, kept on the sheet as the school keeps them. */
const LEFT_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFF2F2F2' },
};

/**
 * Everything on the sheet that is a word rather than a number.
 *
 * Passed in rather than translated here, because this file has no `t`: it runs
 * inside an export click, builds a workbook the office forwards by email, and
 * the language it comes out in has to be the language the screen was in. Held as
 * one object so a heading the sheet gains cannot be forgotten on the way — a
 * missing key is a compile error, not a cell reading `monthlyMark.total`.
 *
 * Two are functions, because their text is built around numbers the sheet only
 * knows row by row: how far short of a full month a student is, and how many
 * students the summary counted.
 */
export interface ClassMonthLabels {
  // The head of the page.
  schoolName: string;
  title: string;
  summary: string;
  homeroomTeacher: string;
  semester: string;

  // The column headings, left to right.
  rollNumber: string;
  studentCode: string;
  studentName: string;
  nickname: string;
  total: string;
  average: string;
  grade: string;
  classification: string;
  conductPoints: string;
  deducted: string;
  remaining: string;
  absences: string;
  excused: string;
  unexcused: string;
  absencesTotal: string;

  // ຈັດປະເພດ — the band, and what stands in for it when the month is part-marked.
  strong: string;
  middling: string;
  weak: string;
  incompleteRow: (recorded: number, total: number) => string;
  /** Said in the classification column of a student who has left the class. */
  left: string;

  // The counted block under the table.
  studentsCounted: (count: number) => string;
  passed: string;
  failed: string;
  schoolDays: string;
  absenceBlock: string;
  excusedAbsence: string;
  unexcusedAbsence: string;
  count: string;
  percent: string;

  // The foot: the notes, the scale, and the two lines somebody signs.
  note: string;
  registerNote: string;
  gradeScale: string;
  director: string;
  signatureDate: string;
  printedOn: string;
}

/**
 * The two borrowed columns, per student — what the marks register cannot answer.
 *
 * ຄະແນນຄຸນສົມບັດ comes from the discipline ledger and ວັນຂາດ from the roll, and
 * both are counted by the modules that own them rather than here: the sheet
 * prints what those registers say, so it cannot disagree with the screens behind
 * it. `daysRecorded` is how many days of the month the roll was actually taken,
 * which is what makes an absence count readable — 2 of 18 is a different fact
 * from 2 of 3.
 *
 * A student the registers do not answer for has no entry at all rather than a
 * row of zeroes: one who has left is off the roll both are built from, and
 * printing zeroes would say the school marked them present every day.
 */
export interface StudentRegisterExtras {
  /** ຖືກຕັດ — conduct points lost across the year to date. */
  deducted: number;
  /** ຍັງເຫຼືອ — what is left of the year's 100. */
  remaining: number;
  /** ຄອບ — excused and sick days together, as the sheet's one column has them. */
  excusedAbsences: number;
  /** ບໍ່ຄອບ. */
  unexcusedAbsences: number;
  /** How many days of the month the roll was taken at all. */
  daysRecorded: number;
}

/**
 * The workbook for one class and one month.
 *
 * `exceljs` is imported here rather than at the module top so it is fetched the
 * first time somebody exports and never by the people who only read the screen —
 * it is several times the size of the page that offers the button.
 */
export async function buildClassMonthWorkbook(
  sheet: ClassMonthSheet,
  labels: ClassMonthLabels,
  registers: Map<string, StudentRegisterExtras>,
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const subjectCount = sheet.subjects.length;
  /**
   * ລ/ດ, ລ/ຕ, ຊື່, ຊື່ຫຼິ້ນ … ລວມ, ສະເລ່ຍ, ເກຣດ, ຈັດປະເພດ, ຖືກຕັດ, ຍັງເຫຼືອ,
   * ຄອບ, ບໍ່ຄອບ, ລວມ.
   *
   * No ລຳດັບ: the school's own sheet does not rank on this page, and a rank
   * printed beside a classification invites the two to be read against each
   * other. It is still on screen, where it is a live figure rather than a
   * filed one.
   */
  const firstSubject = 5;
  const totalColumn = 4 + subjectCount + 1;
  const averageColumn = totalColumn + 1;
  const classColumn = averageColumn + 2;
  const deductedColumn = classColumn + 1;
  const lastColumn = deductedColumn + 4;

  const worksheet = workbook.addWorksheet(labels.summary, {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 6 }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      // The column headings repeat on every printed page; a second page of
      // nameless numbers is not a sheet anyone can check.
      printTitlesRow: '5:6',
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });

  // The mark columns are narrow because their headings stand on end and no
  // longer have to be read across: 11 characters of width was the subject name,
  // not the mark, and eight of those columns is what pushed the sheet onto a
  // second printed page.
  worksheet.columns = [
    { width: 6 },
    { width: 8 },
    { width: 26 },
    { width: 12 },
    ...sheet.subjects.map(() => ({ width: 7 })),
    { width: 8 },
    { width: 8 },
    { width: 6 },
    { width: 12 },
    { width: 8 },
    { width: 9 },
    { width: 7 },
    { width: 8 },
    { width: 7 },
  ];

  // ── Heading ──────────────────────────────────────────────────────────────
  const heading = (text: string, size: number, bold: boolean) => {
    const row = worksheet.addRow([text]);
    worksheet.mergeCells(row.number, 1, row.number, lastColumn);
    row.getCell(1).font = laoFont({ size, bold });
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.height = size + 8;
    return row;
  };

  heading(labels.schoolName, 14, true);
  heading(labels.title, 12, true);
  heading(
    [
      `${labels.homeroomTeacher}: ${sheet.classroom.homeroomTeacherName ?? '—'}`,
      `${labels.semester}: ${sheet.semester.nameLo}`,
    ].join('     '),
    11,
    false,
  );

  // The crest goes in the corner the three centred heading rows leave free —
  // a shade under the 61pt they come to together.
  await addCrest(workbook, worksheet, 58);

  worksheet.addRow([]);

  // ── Column headings, in the two tiers the paper sheet uses ───────────────
  const headerTop = worksheet.addRow([]);
  const headerBottom = worksheet.addRow([]);

  /** A column that is one thing: its name spans both header rows. */
  const single = (column: number, text: string) => {
    headerTop.getCell(column).value = text;
    worksheet.mergeCells(headerTop.number, column, headerBottom.number, column);
  };
  /** Two columns the school reads as one heading — ຄະແນນຄຸນສົມບັດ, ວັນຂາດ. */
  const grouped = (column: number, text: string, subHeadings: string[]) => {
    headerTop.getCell(column).value = text;
    worksheet.mergeCells(
      headerTop.number,
      column,
      headerTop.number,
      column + subHeadings.length - 1,
    );
    subHeadings.forEach((sub, index) => {
      headerBottom.getCell(column + index).value = sub;
    });
  };

  single(1, labels.rollNumber);
  single(2, labels.studentCode);
  single(3, labels.studentName);
  single(4, labels.nickname);
  sheet.subjects.forEach((subject, index) => single(firstSubject + index, subject.nameLo));
  single(totalColumn, labels.total);
  single(averageColumn, labels.average);
  single(averageColumn + 1, labels.grade);
  single(classColumn, labels.classification);
  grouped(deductedColumn, labels.conductPoints, [labels.deducted, labels.remaining]);
  grouped(deductedColumn + 2, labels.absences, [
    labels.excused,
    labels.unexcused,
    labels.absencesTotal,
  ]);

  // Tall enough for a subject name standing on end: the merged single headings
  // have both rows to run down, the two sub-heading pairs only the lower one.
  headerTop.height = 92;
  headerBottom.height = 64;
  for (const row of [headerTop, headerBottom]) {
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = row.getCell(column);
      cell.font = laoFont({ bold: true });
      cell.fill = HEADER_FILL;
      // Set per cell rather than on the merged master: a merged range whose
      // members are unstyled prints with its inner edges missing.
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  }

  /**
   * ຫົວຖັນຕັ້ງ — every narrow heading turned on its side, as the paper form
   * prints them.
   *
   * ວິທະຍາສາດທຳມະຊາດ over a column of two-digit marks is either a column three
   * times wider than anything in it or a heading wrapped into four unreadable
   * lines; standing it up costs height once at the top of the page instead of
   * width down every one of it. Alignment goes on the merged master, which is
   * the cell Excel reads a merged range's rotation from.
   *
   * The four name columns stay across — they are wide enough to hold their own
   * headings — and so do ຄະແນນຄຸນສົມບັດ and ວັນຂາດ, which span their pairs.
   */
  const upright = (row: typeof headerTop, column: number) => {
    row.getCell(column).alignment = {
      horizontal: 'center',
      vertical: 'middle',
      textRotation: 90,
      wrapText: true,
    };
  };
  // ວິຊາ … ຄະແນນລວມ, ຄະແນນສະເລ່ຍ, ເກຣດ, ຈັດປະເພດ — one unbroken run of columns.
  for (let column = firstSubject; column <= classColumn; column += 1) upright(headerTop, column);
  // ຖືກຕັດ / ຍັງເຫຼືອ and ຄອບ / ບໍ່ຄອບ / ລວມ, under the headings they belong to.
  for (let column = deductedColumn; column <= lastColumn; column += 1) {
    upright(headerBottom, column);
  }

  // ── The class ────────────────────────────────────────────────────────────
  for (const student of sheet.rows) {
    const extras = registers.get(student.studentId);
    const row = worksheet.addRow([
      student.rollNumber ?? null,
      student.studentCode,
      student.studentNameLo,
      student.studentNickname ?? '',
      ...student.scores,
      student.total,
      student.average,
      student.grade ?? '',
      classificationOf(student, subjectCount, labels),
      extras?.deducted ?? null,
      extras?.remaining ?? null,
      extras?.excusedAbsences ?? null,
      extras?.unexcusedAbsences ?? null,
      extras ? extras.excusedAbsences + extras.unexcusedAbsences : null,
    ]);

    // Walked by column rather than with `eachCell`, which stops at the last cell
    // that has a value: a student the registers do not answer for would end the
    // row four columns early and print with the grid missing under them.
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = row.getCell(column);
      cell.border = THIN_BORDER;
      // ຊື່, ຊື່ຫຼິ້ນ and ຈັດປະເພດ are the only cells on the row that hold words;
      // everything else is a figure, down to the roll number and the code.
      const isText = column === 3 || column === 4 || column === classColumn;
      cell.font = isText ? laoFont() : numberFont();
      cell.alignment = {
        horizontal: column === 3 || column === 4 ? 'left' : 'center',
        vertical: 'middle',
      };
      if (!student.isEnrolled) cell.fill = LEFT_FILL;
    }

    // The marks, ລວມ and ສະເລ່ຍ all read out of 10 to two places, as the screen
    // and the paper both write them.
    for (let column = firstSubject; column <= averageColumn; column += 1) {
      const cell = row.getCell(column);
      cell.numFmt = '0.00';
      if (typeof cell.value === 'number' && cell.value < PASSING_MARK) {
        cell.fill = FAIL_FILL;
        cell.font = FAIL_FONT;
      }
    }

    const averageCell = row.getCell(averageColumn);
    averageCell.font = { ...(averageCell.font ?? {}), bold: true };
    if (student.isEnrolled) row.getCell(classColumn).fill = RANK_FILL;

    // A balance that has been drawn on reads like a failing mark, because on
    // this sheet it is one — the school acts on it at the same glance.
    if (extras && extras.deducted > 0) {
      for (const column of [deductedColumn, deductedColumn + 1]) {
        row.getCell(column).fill = FAIL_FILL;
        row.getCell(column).font = FAIL_FONT;
      }
    }
  }

  // ── ສະຫຼຸບ, as the paper counts it at the foot of the block ────────────────
  //
  // Two pass/fail pairs, because the school counts it both ways and reads the
  // difference: ຈຳນວນນັກຮຽນ counts a student as ເສັງຕົກ if any single subject is
  // below 5, while ສະເລ່ຍ counts their month as a whole. A class where the two
  // disagree is one carrying a subject, which is what the pair is there to show.
  //
  // Counted over the students who are on the roll and have a mark: a child who
  // has left is on the sheet for the record, not in its arithmetic.
  worksheet.addRow([]);
  const counted = sheet.rows.filter((student) => student.isEnrolled && student.average !== null);
  const failedSubject = counted.filter((student) =>
    student.scores.some((score) => score !== null && score < PASSING_MARK),
  ).length;
  const failedAverage = counted.filter(
    (student) => (student.average as number) < PASSING_MARK,
  ).length;

  const absenceTotal = (pick: (extras: StudentRegisterExtras) => number) =>
    sheet.rows.reduce((sum, student) => {
      const extras = registers.get(student.studentId);
      return sum + (extras ? pick(extras) : 0);
    }, 0);

  const excusedDays = absenceTotal((extras) => extras.excusedAbsences);
  const unexcusedDays = absenceTotal((extras) => extras.unexcusedAbsences);

  /**
   * ຈຳນວນມື້ຮຽນ — how many days the roll was actually called this month.
   *
   * Taken as the most any one student was marked rather than as a calendar
   * count: a class is rolled on the days it is taught, and the school's own
   * ການຂາດຮຽນ percentage is absences over students × those days. A student who
   * joined mid-month has fewer of them, so the largest is the month's length.
   */
  const schoolDays = sheet.rows.reduce(
    (days, student) => Math.max(days, registers.get(student.studentId)?.daysRecorded ?? 0),
    0,
  );

  const share = (part: number, whole: number) =>
    whole === 0 ? '—' : `${((part / whole) * 100).toFixed(2)} %`;

  const summaryStart = 2;
  const headings = worksheet.addRow([]);
  const subHeadings = worksheet.addRow([]);
  const counts = worksheet.addRow([]);
  const percents = worksheet.addRow([]);

  // Row 1 — the four headings, each over the pair it counts.
  headings.getCell(summaryStart + 1).value = labels.studentsCounted(counted.length);
  worksheet.mergeCells(headings.number, summaryStart + 1, headings.number, summaryStart + 2);
  headings.getCell(summaryStart + 3).value = labels.average;
  worksheet.mergeCells(headings.number, summaryStart + 3, headings.number, summaryStart + 4);
  headings.getCell(summaryStart + 5).value = labels.schoolDays;
  headings.getCell(summaryStart + 6).value = labels.absenceBlock;
  worksheet.mergeCells(headings.number, summaryStart + 6, headings.number, summaryStart + 7);

  // Row 2 — the columns themselves, and the two figures that stand alone.
  subHeadings.getCell(summaryStart + 1).value = labels.passed;
  subHeadings.getCell(summaryStart + 2).value = labels.failed;
  subHeadings.getCell(summaryStart + 3).value = labels.passed;
  subHeadings.getCell(summaryStart + 4).value = labels.failed;
  subHeadings.getCell(summaryStart + 5).value = schoolDays;
  worksheet.mergeCells(subHeadings.number, summaryStart + 5, percents.number, summaryStart + 5);
  subHeadings.getCell(summaryStart + 6).value = labels.excusedAbsence;
  subHeadings.getCell(summaryStart + 7).value = labels.unexcusedAbsence;

  // Rows 3 and 4 — the count, then the same figure as a share.
  counts.getCell(summaryStart).value = labels.count;
  percents.getCell(summaryStart).value = labels.percent;

  const cells: [number, number, string][] = [
    [
      summaryStart + 1,
      counted.length - failedSubject,
      share(counted.length - failedSubject, counted.length),
    ],
    [summaryStart + 2, failedSubject, share(failedSubject, counted.length)],
    [
      summaryStart + 3,
      counted.length - failedAverage,
      share(counted.length - failedAverage, counted.length),
    ],
    [summaryStart + 4, failedAverage, share(failedAverage, counted.length)],
    // Absences are a share of the days that could have been attended, which is
    // how the school reads them: 2 days off 17 students × 21 days is 0.56 %.
    [summaryStart + 6, excusedDays, share(excusedDays, counted.length * schoolDays)],
    [summaryStart + 7, unexcusedDays, share(unexcusedDays, counted.length * schoolDays)],
  ];
  for (const [column, count, percentage] of cells) {
    counts.getCell(column).value = count;
    percents.getCell(column).value = percentage;
  }

  for (const row of [headings, subHeadings, counts, percents]) {
    row.height = 18;
    for (let column = summaryStart; column <= summaryStart + 7; column += 1) {
      const cell = row.getCell(column);
      cell.border = THIN_BORDER;
      cell.font = laoFont();
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  }
  for (const row of [headings, subHeadings]) {
    for (let column = summaryStart + 1; column <= summaryStart + 7; column += 1) {
      row.getCell(column).font = laoFont({ bold: true });
      row.getCell(column).fill = HEADER_FILL;
    }
  }
  // The two standing figures are values, not headings.
  subHeadings.getCell(summaryStart + 5).fill = RANK_FILL;
  counts.getCell(summaryStart).font = laoFont({ bold: true });
  percents.getCell(summaryStart).font = laoFont({ bold: true });
  // Set last, over the heading styling above: these cells count and are read as
  // figures, however they are laid out.
  subHeadings.getCell(summaryStart + 5).font = numberFont({ bold: true });
  for (const [column] of cells) {
    counts.getCell(column).font = numberFont();
    percents.getCell(column).font = numberFont();
  }

  // ── Signatures ───────────────────────────────────────────────────────────
  //
  // Both names are signed by hand once the sheet is off the printer, so the
  // block is a place to sign rather than two labels: the date over it, then
  // three rows of clear room and a line to sign on. The labels used to sit
  // straight on top of the notes, leaving the office nowhere to put a pen.
  worksheet.addRow([]);
  const signatureColumn = Math.max(5, lastColumn - 4);
  /** The left-hand column of each block; each one runs three columns wide. */
  const signatureBlocks = [2, signatureColumn];

  const dateLine = worksheet.addRow([]);
  dateLine.getCell(signatureColumn).value = labels.signatureDate;
  worksheet.mergeCells(dateLine.number, signatureColumn, dateLine.number, signatureColumn + 2);
  dateLine.getCell(signatureColumn).font = laoFont();
  dateLine.getCell(signatureColumn).alignment = { horizontal: 'center' };

  worksheet.addRow([]);
  const signatures = worksheet.addRow([]);
  signatures.getCell(2).value = labels.director;
  signatures.getCell(signatureColumn).value = labels.homeroomTeacher;
  for (const column of signatureBlocks) {
    worksheet.mergeCells(signatures.number, column, signatures.number, column + 2);
    const cell = signatures.getCell(column);
    cell.font = laoFont({ bold: true });
    cell.alignment = { horizontal: 'center' };
  }

  // The room itself — three rows of it, closed by the line the name goes on.
  for (let index = 0; index < 3; index += 1) worksheet.addRow([]).height = 24;
  const signatureRule = worksheet.addRow([]);
  signatureRule.height = 8;
  for (const column of signatureBlocks) {
    worksheet.mergeCells(signatureRule.number, column, signatureRule.number, column + 2);
    // Drawn on every cell of the range, not only its master: a merged range
    // carries its master's border across just one column when it prints.
    for (let span = column; span <= column + 2; span += 1) {
      signatureRule.getCell(span).border = { bottom: { style: 'dotted' } };
    }
  }

  // ── The notes the screen carries under the table ─────────────────────────
  worksheet.addRow([]);
  for (const note of [labels.note, labels.registerNote, labels.gradeScale, labels.printedOn]) {
    const row = worksheet.addRow([note]);
    worksheet.mergeCells(row.number, 1, row.number, lastColumn);
    row.getCell(1).font = laoFont({ size: 9, color: { argb: 'FF6B7280' } });
    row.getCell(1).alignment = { horizontal: 'left' };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * ຈັດປະເພດ — where the month puts the student, withheld while it is unfinished.
 *
 * The band itself is the API's, decided on the cuts the office keeps in
 * settings; this only chooses the word for it. A student short of a subject has
 * no band at all — their ສະເລ່ຍ is divided by every subject of the grade, so
 * banding a half-marked month in a file the office forwards would be a judgement
 * the sheet cannot support — and the count of what has been marked goes in the
 * cell instead, as it does on screen.
 */
function classificationOf(
  student: ClassMonthSheet['rows'][number],
  subjects: number,
  labels: ClassMonthLabels,
): string {
  const bandLabels = { strong: labels.strong, middling: labels.middling, weak: labels.weak };
  const band =
    student.average === null
      ? ''
      : student.classification === null
        ? labels.incompleteRow(student.subjectsRecorded, subjects)
        : bandLabels[student.classification];

  // The grey row says "left" on paper and nothing at all in a forwarded file, so
  // the column says it too rather than the shading carrying it alone.
  if (student.isEnrolled) return band;
  return band ? `${band} · ${labels.left}` : labels.left;
}

/**
 * `ສະຫຼຸບຄະແນນເດືອນກັນຍາ(09)／ມ.1／ຂ.xlsx` — the name the office files it under.
 *
 * Written the way the school says it out loud: the month in words with its
 * number after it, then the class. A folder of them sorts by name into
 * something a person can read down, and a file forwarded on its own still says
 * which month and which class it is.
 *
 * The class is the same string the screen puts at the head of the sheet, not
 * the fields it is built from. `gradeLevelCode` is a database code — `m1`, in
 * Latin letters the office never writes — and the classroom's own name usually
 * carries the grade already, so pasting the two together filed the month as
 * `…-m1-ມ-1-ຂ`: the grade twice, once in a spelling nobody uses.
 *
 * Two details the office does not see:
 *
 * The separator is a fullwidth solidus (／), not `/`. A plain slash is a path
 * separator on every system there is — the browser would rewrite it on the way
 * to the downloads folder, each one differently — while ／ is an ordinary
 * character that Windows, macOS and Linux all accept and that reads as the
 * slash the school writes. The one inside `ມ.1/ຂ` is swapped for it too, so the
 * class is not left a dash where the school writes a stroke.
 *
 * And what is stripped is only what a filesystem refuses. The old sanitiser
 * kept `\p{L}` and dropped everything else, which quietly ate the vowel signs
 * and tone marks out of the Lao — `ສະຫຼຸບປະຈຳເດືອນ` filed itself as
 * `ສະຫ-ບປະຈຳເດ-ອນ`, because those marks are `\p{M}`, not letters.
 */
export function classMonthFileName(sheet: ClassMonthSheet, heading: string): string {
  const classroom = classroomHeading(sheet.classroom).replace(/\//g, FILENAME_SLASH);
  return `${safeFileName(`${heading}${FILENAME_SLASH}${classroom}`)}.xlsx`;
}
