import type { Font, Workbook, Worksheet } from 'exceljs';

/**
 * The house style every workbook this admin exports is set in.
 *
 * The office asked for it in September 2026, looking at the monthly summary: the
 * crest at the head, Lao in Phetsarath and figures in Times New Roman, headings
 * bold on a ruled grid. These files are printed, signed and filed, so they have
 * to look like the forms the school already signs — and the second export to be
 * written is where a house style stops being one file's formatting and starts
 * being a house style.
 *
 * `exceljs` is not imported here beyond its types: every workbook fetches it on
 * the click, and a shared style module that pulled it in would undo that.
 */

/**
 * Lao runs in Phetsarath OT, which is what the ministry's forms and every letter
 * this office sends are set in.
 *
 * Named per cell rather than left to Excel's default, because these files are
 * opened on machines that default to Calibri and would render the Lao in a
 * fallback face that breaks the vowel marks. A machine without Phetsarath
 * installed still falls back on its own — nothing this side can do about that,
 * and the file still says what it should be set in.
 */
export const LAO_FONT = 'Phetsarath OT';

/**
 * Figures run in Times New Roman, whose digits are narrower and line up down a
 * column of marks in a way Phetsarath's do not.
 */
export const NUMBER_FONT = 'Times New Roman';

/** Lao text — headings, names, the notes at the foot. */
export const laoFont = (font: Partial<Font> = {}): Partial<Font> => ({ name: LAO_FONT, ...font });

/** Anything read as a figure: marks, counts, codes, percentages, dates. */
export const numberFont = (font: Partial<Font> = {}): Partial<Font> => ({
  name: NUMBER_FONT,
  ...font,
});

export const THIN_BORDER = {
  top: { style: 'thin' as const },
  left: { style: 'thin' as const },
  bottom: { style: 'thin' as const },
  right: { style: 'thin' as const },
};

/** The grey a column heading sits on. */
export const HEADER_FILL = {
  type: 'pattern' as const,
  pattern: 'solid' as const,
  fgColor: { argb: 'FFEDF2F7' },
};

/**
 * ຕາໂຮງຮຽນ — the crest, floated over the top-left corner of a sheet.
 *
 * Floated rather than put in a cell because the heading rows beside it are
 * merged across the whole sheet and centred, so the crest sits in the margin
 * that centring leaves — which is where it sits on the office's own letterhead.
 *
 * Scaled off its own ratio so it cannot come out stretched, and skipped rather
 * than fatal if the bytes ever fail to load: a sheet that will not export is a
 * worse outcome than one exporting without its crest.
 *
 * @param height How tall to draw it, in points — give it the heading rows.
 * @param topRow The 1-based row the crest hangs from — the head of the sheet
 *   unless the sheet is several letters on one worksheet, each with its own.
 */
export async function addCrest(
  workbook: Workbook,
  worksheet: Worksheet,
  height: number,
  topRow = 1,
): Promise<void> {
  try {
    const { SCHOOL_LOGO_PNG_BASE64, SCHOOL_LOGO_SIZE } = await import('./school-logo');
    worksheet.addImage(workbook.addImage({ base64: SCHOOL_LOGO_PNG_BASE64, extension: 'png' }), {
      tl: { col: 0.15, row: topRow - 1 + 0.1 },
      ext: { width: (height * SCHOOL_LOGO_SIZE.width) / SCHOOL_LOGO_SIZE.height, height },
    });
  } catch {
    // The crest is letterhead; the rows are the document.
  }
}

/**
 * Everything Windows, macOS or Linux refuses in a file name, and nothing else.
 *
 * A blocklist rather than an allowlist of letters: `\p{L}` drops the vowel signs
 * and tone marks Lao is written with — they are `\p{M}` — so an allowlist filed
 * `ສະຫຼຸບປະຈຳເດືອນ` as `ສະຫ-ບປະຈຳເດ-ອນ`.
 */
export function safeFileName(name: string): string {
  return (
    name
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
      .replace(/\s+/g, ' ')
      // Windows will not keep a name that ends in a dot or a space.
      .replace(/^[\s.]+|[\s.]+$/g, '')
  );
}

/**
 * The stroke the school writes a class with — `ມ.1／ຂ`.
 *
 * A plain `/` is a path separator on every system there is, and the browser
 * rewrites it on the way to the downloads folder, each one differently. `／` is
 * an ordinary character all three accept, and reads as the slash it stands for.
 */
export const FILENAME_SLASH = '／';
