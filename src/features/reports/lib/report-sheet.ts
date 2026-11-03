import type { Worksheet } from 'exceljs';
import { HEADER_FILL, laoFont, THIN_BORDER } from '@/lib/workbook';

/**
 * The parts every sheet on ລາຍງານ shares — a centred heading under the crest, a
 * shaded header row, room for the director and the reporter to sign, and the
 * small print. One copy, so the school's reports look like one set.
 */

/** Landscape, one page wide, as long as it needs. */
export const REPORT_PAGE_SETUP = {
  orientation: 'landscape' as const,
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
};

export interface SignatureLabels {
  director: string;
  reporter: string;
  signatureDate: string;
}

export function addHeading(worksheet: Worksheet, schoolName: string, title: string, lastColumn: number) {
  for (const [text, size] of [
    [schoolName, 14],
    [title, 12],
  ] as const) {
    const row = worksheet.addRow([text]);
    worksheet.mergeCells(row.number, 1, row.number, lastColumn);
    row.getCell(1).font = laoFont({ size, bold: true });
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    row.height = size + 8;
  }
}

export function addHeaderRow(worksheet: Worksheet, titles: string[]) {
  const row = worksheet.addRow(titles);
  row.height = 34;
  titles.forEach((_, index) => {
    const cell = row.getCell(index + 1);
    cell.font = laoFont({ bold: true });
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  });
}

/**
 * Room to sign — the reporter and the director, the date over the reporter, as
 * on the monthly sheet. Signed by hand once printed, so it is space and a line
 * rather than two labels.
 */
export function addSignatures(worksheet: Worksheet, labels: SignatureLabels, lastColumn: number) {
  worksheet.addRow([]);
  const right = lastColumn - 2;
  const blocks = [2, right];

  const date = worksheet.addRow([]);
  date.getCell(right).value = labels.signatureDate;
  worksheet.mergeCells(date.number, right, date.number, right + 2);
  date.getCell(right).font = laoFont();
  date.getCell(right).alignment = { horizontal: 'center' };

  const titles = worksheet.addRow([]);
  titles.getCell(2).value = labels.director;
  titles.getCell(right).value = labels.reporter;
  for (const column of blocks) {
    worksheet.mergeCells(titles.number, column, titles.number, column + 2);
    titles.getCell(column).font = laoFont({ bold: true });
    titles.getCell(column).alignment = { horizontal: 'center' };
  }

  for (let index = 0; index < 3; index += 1) worksheet.addRow([]).height = 24;
  const rule = worksheet.addRow([]);
  rule.height = 8;
  for (const column of blocks) {
    worksheet.mergeCells(rule.number, column, rule.number, column + 2);
    // Every cell of the range, not only its master — see the monthly sheet.
    for (let span = column; span <= column + 2; span += 1) {
      rule.getCell(span).border = { bottom: { style: 'dotted' } };
    }
  }
}

export function addNotes(worksheet: Worksheet, notes: string[], lastColumn: number) {
  worksheet.addRow([]);
  for (const note of notes) {
    const row = worksheet.addRow([note]);
    worksheet.mergeCells(row.number, 1, row.number, lastColumn);
    row.getCell(1).font = laoFont({ size: 9, color: { argb: 'FF6B7280' } });
    row.getCell(1).alignment = { horizontal: 'left', wrapText: true };
  }
}
