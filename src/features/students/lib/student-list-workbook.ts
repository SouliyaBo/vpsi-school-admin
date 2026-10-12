import {
  addCrest,
  HEADER_FILL,
  laoFont,
  numberFont,
  safeFileName,
  THIN_BORDER,
} from '@/lib/workbook';

/**
 * ບັນຊີລາຍຊື່ນັກຮຽນ — the roster the office actually hands round.
 *
 * The screen is a working list: it filters, it pages, and it shows a photo, a
 * guardian and an age because that is what somebody looking a child up needs.
 * What the office is asked for on paper is narrower and flatter — the register
 * number, the honorific, the name in both scripts, the class and whose room it
 * is — and it has to be the whole list, not the twenty rows on screen. So the
 * export is its own shape rather than a dump of the table.
 *
 * The two name languages are kept in separate columns rather than one rendered
 * name: the ministry's forms ask for ຊື່ and ນາມສະກຸນ apart, and half the
 * paperwork the office fills in from this list is in English.
 *
 * Every row is written as the API gave it — nothing here decides a status, a
 * class or a homeroom teacher — so the file cannot disagree with the screen it
 * was exported from.
 */

/** One student, flattened to what the paper roster carries. */
export interface StudentListRow {
  /** ລ/ຕ — the register number, `..` and all: what is on file is what prints. */
  studentCode: string;
  /** Already translated by the caller — the workbook does not read enums. */
  status: string;
  /** ທ້າວ / ນາງ, derived by the API from gender; blank when gender is not on file. */
  title: string;
  firstNameLo: string;
  lastNameLo: string;
  nickname: string;
  /** The register name in English, both halves, or blank. */
  nameEn: string;
  nicknameEn: string;
  /** `ມ.1/ຂ`, or blank for a child the office has not placed yet. */
  classroom: string;
  homeroomTeacher: string;
  /** ຫ້ອງພາກອັງກິດ, blank when the office has not set one. */
  englishClass: string;
}

/** Every string the sheet prints, resolved by the caller through `t`. */
export interface StudentListLabels {
  schoolName: string;
  /** ບັນຊີລາຍຊື່ນັກຮຽນ ສົກຮຽນ 2025-2026. */
  title: string;
  /** Which filters were in force, so a printed copy says what it is a list of. */
  filters: string;
  sheetName: string;
  rowNumber: string;
  studentCode: string;
  status: string;
  honorific: string;
  firstName: string;
  lastName: string;
  nickname: string;
  nameEn: string;
  nicknameEn: string;
  classroom: string;
  homeroomTeacher: string;
  englishClass: string;
  /** ລວມ {{count}} ຄົນ. */
  total: (count: number) => string;
  printedOn: string;
}

/**
 * The columns, in the order the office reads them.
 *
 * `lao` says which face the cell is set in: the register name and the class are
 * Lao, while the register number and the English name are not — and a code of
 * digits set in Phetsarath beside one set in Times New Roman is the kind of
 * thing that gets a printed list handed back.
 */
const COLUMNS: {
  key: keyof StudentListRow | 'rowNumber';
  label: keyof StudentListLabels;
  width: number;
  lao: boolean;
}[] = [
  { key: 'rowNumber', label: 'rowNumber', width: 6, lao: false },
  { key: 'studentCode', label: 'studentCode', width: 10, lao: false },
  { key: 'status', label: 'status', width: 13, lao: true },
  { key: 'title', label: 'honorific', width: 9, lao: true },
  { key: 'firstNameLo', label: 'firstName', width: 18, lao: true },
  { key: 'lastNameLo', label: 'lastName', width: 18, lao: true },
  { key: 'nickname', label: 'nickname', width: 12, lao: true },
  { key: 'nameEn', label: 'nameEn', width: 26, lao: false },
  { key: 'nicknameEn', label: 'nicknameEn', width: 14, lao: false },
  { key: 'classroom', label: 'classroom', width: 12, lao: true },
  // Next to the homeroom, because the two are read as a pair. Set in the Latin
  // face: the office writes these as `EP-A`, not in Lao script.
  { key: 'englishClass', label: 'englishClass', width: 14, lao: false },
  { key: 'homeroomTeacher', label: 'homeroomTeacher', width: 24, lao: true },
];

/**
 * The roster as a workbook.
 *
 * `exceljs` is imported here rather than at the module top so it is fetched the
 * first time somebody exports and never by the people who only read the screen —
 * it is several times the size of the page that offers the button.
 */
export async function buildStudentListWorkbook(
  rows: StudentListRow[],
  labels: StudentListLabels,
): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const lastColumn = COLUMNS.length;
  const worksheet = workbook.addWorksheet(labels.sheetName, {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      // The column headings repeat on every printed page; a second page of
      // nameless columns is not a list anyone can check.
      printTitlesRow: '5:5',
      margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    },
  });
  worksheet.columns = COLUMNS.map((column) => ({ width: column.width }));

  // ── Heading ──────────────────────────────────────────────────────────────
  const heading = (text: string, size: number, bold: boolean) => {
    const row = worksheet.addRow([text]);
    worksheet.mergeCells(row.number, 1, row.number, lastColumn);
    row.getCell(1).font = laoFont({ size, bold });
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.height = size + 8;
  };

  heading(labels.schoolName, 14, true);
  heading(labels.title, 12, true);
  heading(labels.filters, 10, false);
  await addCrest(workbook, worksheet, 58);
  worksheet.addRow([]);

  // ── Column headings ──────────────────────────────────────────────────────
  const header = worksheet.addRow(COLUMNS.map((column) => labels[column.label] as string));
  header.height = 30;
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = header.getCell(column);
    cell.font = laoFont({ bold: true });
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  // ── The roster ───────────────────────────────────────────────────────────
  rows.forEach((student, index) => {
    const row = worksheet.addRow(
      COLUMNS.map((column) => (column.key === 'rowNumber' ? index + 1 : student[column.key])),
    );
    COLUMNS.forEach((column, offset) => {
      const cell = row.getCell(offset + 1);
      cell.border = THIN_BORDER;
      cell.font = column.lao ? laoFont() : numberFont();
      // The names are read down the column, so they start at the same place;
      // the short fields are centred under their headings.
      cell.alignment = {
        horizontal: column.width >= 18 ? 'left' : 'center',
        vertical: 'middle',
      };
    });
  });

  // The list is filtered and sorted from here as often as it is printed.
  worksheet.autoFilter = {
    from: { row: header.number, column: 1 },
    to: { row: header.number + rows.length, column: lastColumn },
  };
  worksheet.views = [{ state: 'frozen', ySplit: header.number }];

  // ── The count, and when it was taken ─────────────────────────────────────
  worksheet.addRow([]);
  for (const [text, bold] of [
    [labels.total(rows.length), true],
    [labels.printedOn, false],
  ] as const) {
    const row = worksheet.addRow([text]);
    worksheet.mergeCells(row.number, 1, row.number, lastColumn);
    row.getCell(1).font = laoFont(bold ? { bold: true } : { size: 9, color: { argb: 'FF6B7280' } });
    row.getCell(1).alignment = { horizontal: 'left' };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** `ບັນຊີລາຍຊື່ນັກຮຽນ ມ.1／ຂ 2025-2026.xlsx` — the name the office files it under. */
export function studentListFileName(heading: string): string {
  return `${safeFileName(heading)}.xlsx`;
}
