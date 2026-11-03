import {
  addCrest,
  FILENAME_SLASH,
  HEADER_FILL,
  laoFont,
  numberFont,
  safeFileName,
  THIN_BORDER,
} from '@/lib/workbook';

/**
 * ຜົນສອບປາລະໄນ — one class's multiple-choice marks as a workbook.
 *
 * The ສົ່ງເຂົ້າຄະແນນປະຈຳເດືອນ button covers a paper that is the whole test. Some
 * tests are half ປາລະໄນ and half ອັດຕະໄນ, written on paper and marked by hand,
 * and the teacher adds the two up before anything is recorded (the office, 21
 * Oct 2026). So the sheet carries an empty ອັດຕະໄນ column to type into, and a
 * ລວມ that is a formula over the two, which Excel keeps up to date as the
 * teacher types.
 *
 * A paper split by subject (ທຳມະຊາດ → ຟີຊິກ, ເຄມີ, ຊີວະ) gets those three
 * columns once per subject, under the subject's name.
 *
 * Every figure is the one the API marked; nothing is graded here.
 */

/** One pupil, as the results table shows them. */
export interface ResultsRow {
  rollNumber: number | null;
  studentCode: string;
  studentNameLo: string;
  /** The set sat, or `null` for a sheet not keyed in yet. */
  setLabel: string | null;
  correctCount: number | null;
  /**
   * The ປາລະໄນ points, one per group, in the groups' order; `null` when
   * unmarked, or when there is no total to scale to.
   */
  points: (number | null)[];
}

/** One run of ປາລະໄນ · ອັດຕະໄນ · ລວມ: the whole paper, or one subject of it. */
export interface ResultsGroup {
  /** The subject over the three columns; `null` for a paper marked whole. */
  name: string | null;
  /** ປາລະໄນ (/3). */
  objective: string;
}

/** Every string the sheet prints, resolved by the caller through `t`. */
export interface ResultsLabels {
  schoolName: string;
  /** ຜົນສອບປາລະໄນ — the paper's title. */
  title: string;
  /** Subject, class, term and what the paper is out of, on one line. */
  details: string;
  sheetName: string;
  rowNumber: string;
  studentCode: string;
  studentName: string;
  set: string;
  /** ຂໍ້ຖືກ (/20). */
  correct: string;
  groups: ResultsGroup[];
  subjective: string;
  total: string;
  notMarked: string;
  /** ກວດແລ້ວ 30/32 ຄົນ. */
  marked: string;
  signatureDate: string;
  teacher: string;
  printedOn: string;
}

type FixedLabel = 'rowNumber' | 'studentCode' | 'studentName' | 'set' | 'correct';

/** The pupil's own columns, before the groups. */
const FIXED: { label: FixedLabel; width: number }[] = [
  { label: 'rowNumber', width: 6 },
  { label: 'studentCode', width: 10 },
  { label: 'studentName', width: 30 },
  { label: 'set', width: 7 },
  { label: 'correct', width: 12 },
];
const NAME_COLUMN = 3;
const CORRECT_COLUMN = 5;
/** ປາລະໄນ, ອັດຕະໄນ, ລວມ. */
const GROUP_WIDTHS = [13, 11, 10];

/** The pale yellow of a cell left for the teacher to fill in. */
const INPUT_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFFFF8DC' },
};

/** `1` → `A`, `27` → `AA`. */
function columnLetter(column: number): string {
  let letters = '';
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

export async function buildResultsWorkbook(
  rows: ResultsRow[],
  labels: ResultsLabels,
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const { groups } = labels;
  const split = groups.some((group) => group.name !== null);
  /** 1-based column of a group's ປາລະໄນ; ອັດຕະໄນ and ລວມ follow it. */
  const groupStart = (index: number) => FIXED.length + 1 + index * 3;
  const lastColumn = FIXED.length + groups.length * 3;
  const firstHeader = 5;
  const lastHeader = split ? firstHeader + 1 : firstHeader;

  const worksheet = workbook.addWorksheet(labels.sheetName, {
    pageSetup: {
      orientation: groups.length > 1 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: `${firstHeader}:${lastHeader}`,
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  worksheet.columns = [
    ...FIXED.map((column) => ({ width: column.width })),
    ...groups.flatMap(() => GROUP_WIDTHS.map((width) => ({ width }))),
  ];

  // ── Heading ──────────────────────────────────────────────────────────────
  const heading = (text: string, size: number, bold: boolean) => {
    const row = worksheet.addRow([text]);
    worksheet.mergeCells(row.number, 1, row.number, lastColumn);
    row.getCell(1).font = laoFont({ size, bold });
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    row.height = size + 8;
  };

  heading(labels.schoolName, 14, true);
  heading(labels.title, 12, true);
  heading(labels.details, 10, false);
  await addCrest(workbook, worksheet, 58);
  worksheet.addRow([]);

  // ── Column headings ──────────────────────────────────────────────────────
  // Split: the pupil's columns span both heading rows, each subject's name
  // spans its three columns, and the three are named on the row under it.
  const top = worksheet.addRow([
    ...FIXED.map((column) => labels[column.label]),
    ...groups.flatMap((group) =>
      split ? [group.name ?? '', '', ''] : [group.objective, labels.subjective, labels.total],
    ),
  ]);
  top.height = split ? 22 : 30;
  if (split) {
    const sub = worksheet.addRow([
      ...FIXED.map(() => ''),
      ...groups.flatMap((group) => [group.objective, labels.subjective, labels.total]),
    ]);
    sub.height = 30;
    FIXED.forEach((_, offset) =>
      worksheet.mergeCells(top.number, offset + 1, sub.number, offset + 1),
    );
    groups.forEach((_, index) =>
      worksheet.mergeCells(top.number, groupStart(index), top.number, groupStart(index) + 2),
    );
  }
  for (let at = firstHeader; at <= lastHeader; at += 1) {
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = worksheet.getRow(at).getCell(column);
      cell.font = laoFont({ bold: true });
      cell.fill = HEADER_FILL;
      cell.border = THIN_BORDER;
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    }
  }

  // ── The class ────────────────────────────────────────────────────────────
  rows.forEach((pupil, index) => {
    const marked = pupil.correctCount !== null;
    const row = worksheet.addRow([
      pupil.rollNumber ?? index + 1,
      pupil.studentCode,
      pupil.studentNameLo,
      pupil.setLabel ?? '',
      marked ? pupil.correctCount : labels.notMarked,
      ...groups.flatMap((_, g) => [pupil.points[g] ?? null, null, null]),
    ]);
    const at = row.number;
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = row.getCell(column);
      cell.border = THIN_BORDER;
      const lao = column === NAME_COLUMN || (column === CORRECT_COLUMN && !marked);
      cell.font = lao ? laoFont() : numberFont();
      cell.alignment =
        column === NAME_COLUMN
          ? { horizontal: 'left', vertical: 'middle', indent: 1 }
          : { horizontal: 'center', vertical: 'middle' };
    }
    groups.forEach((_, g) => {
      const range = `${columnLetter(groupStart(g))}${at}:${columnLetter(groupStart(g) + 1)}${at}`;
      row.getCell(groupStart(g) + 1).fill = INPUT_FILL;
      const total = row.getCell(groupStart(g) + 2);
      // Blank until either half is in, so an unmarked pupil does not read as 0.
      total.value = { formula: `IF(COUNT(${range})=0,"",SUM(${range}))` };
      total.font = numberFont({ bold: true });
    });
  });

  worksheet.views = [{ state: 'frozen', ySplit: lastHeader }];

  // ── The count, and a place to sign ───────────────────────────────────────
  worksheet.addRow([]);
  const count = worksheet.addRow([labels.marked]);
  worksheet.mergeCells(count.number, 1, count.number, lastColumn);
  count.getCell(1).font = laoFont({ bold: true });

  worksheet.addRow([]);
  const signatureColumn = Math.max(CORRECT_COLUMN, lastColumn - 3);
  for (const [text, bold] of [
    [labels.signatureDate, false],
    [labels.teacher, true],
  ] as const) {
    const row = worksheet.addRow([]);
    row.getCell(signatureColumn).value = text;
    worksheet.mergeCells(row.number, signatureColumn, row.number, lastColumn);
    row.getCell(signatureColumn).font = laoFont({ bold });
    row.getCell(signatureColumn).alignment = { horizontal: 'center' };
  }
  for (let blank = 0; blank < 3; blank += 1) worksheet.addRow([]);

  const printed = worksheet.addRow([labels.printedOn]);
  worksheet.mergeCells(printed.number, 1, printed.number, lastColumn);
  printed.getCell(1).font = laoFont({ size: 9, color: { argb: 'FF6B7280' } });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** `ບົດສອບຟີຊິກ ມ.4／ກ.xlsx`. */
export function resultsFileName(title: string, classroom: string): string {
  return `${safeFileName(`${title} ${classroom.replace(/\//g, FILENAME_SLASH)}`)}.xlsx`;
}
