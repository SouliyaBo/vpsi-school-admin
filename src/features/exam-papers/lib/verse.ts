/**
 * ຄຳກອນ in a question — a proverb, a ຄຳຜະຫຍາ, a ສຸພາສິດ — printed as verse:
 * two ວັກ to a row, the second column starting at the same place on every row.
 *
 * Marked in the question text itself, so it survives every save and needs no
 * new field: the block sits between `⟪` and `⟫`, each line is a row, and `|`
 * divides a row into its ວັກ.
 *
 *     ຄຳຜະຫຍາທີ່ວ່າ:
 *     ⟪“ສາວບໍ່ມັກອ້າຍ | ບໍ່ມັກຕາຍກໍຕາມຊ່າງ
 *     ບໍ່ໄດ້ຫໍ່ຂີ້ຈ້າງ | ໃຫ້ຕາມກົ້ນແລ່ນນຳ”⟫
 *     ໃຊ້ສິລະປະການປະດິດແຕ່ງແບບໃດ?
 *
 * The teacher puts it there with ຈັດເປັນກອນ on the review page (`versify`), or
 * the upload does when the Word file divides the ວັກ with a Tab
 * (`versifyTabs`). Asked for by the office on 20 Oct 2026, after a ມ.5
 * ພາສາລາວ paper printed a ຄຳຜະຫຍາ as running prose.
 *
 * A copy of the API's `exam-papers/verse.ts`, for the review page's button
 * and preview; the two must agree on the markers. The API alone reads Tabs
 * from Word (`versifyTabs`).
 */

export const VERSE_OPEN = '⟪';
export const VERSE_CLOSE = '⟫';
export const VERSE_COLUMN = '|';

const BLOCK = /⟪([\s\S]*?)⟫/g;

export type VersePart = { kind: 'text'; text: string } | { kind: 'verse'; rows: string[][] };

export function hasVerse(text: string): boolean {
  BLOCK.lastIndex = 0;
  return BLOCK.test(text);
}

/** The rows of one block: a line each, cut at `|`, blank lines dropped. */
function rowsOf(block: string): string[][] {
  return block
    .split('\n')
    .map((line) => line.split(VERSE_COLUMN).map((cell) => cell.trim()))
    .filter((row) => row.some((cell) => cell.length > 0));
}

/**
 * The text cut into prose and verse, in order.
 *
 * The space or line break on either side of a block belongs to the block, so
 * prose before and after neither prints an empty line round the verse nor
 * starts with a stray space.
 */
export function splitVerse(text: string): VersePart[] {
  const parts: VersePart[] = [];
  let last = 0;
  BLOCK.lastIndex = 0;
  for (const match of text.matchAll(BLOCK)) {
    const index = match.index ?? 0;
    const before = text.slice(last, index).replace(/\s+$/, '');
    if (before.trim()) parts.push({ kind: 'text', text: before });
    const rows = rowsOf(match[1]);
    if (rows.length > 0) parts.push({ kind: 'verse', rows });
    last = index + match[0].length;
    while (last < text.length && /\s/.test(text[last])) last += 1;
  }
  const after = text.slice(last);
  if (after.trim()) parts.push({ kind: 'text', text: after });
  return parts;
}

/**
 * Selected text turned into a verse block.
 *
 * Lines that already say where their ວັກ divide — with a Tab or a `|` — keep
 * those divisions. Otherwise the text is cut at its spaces, which in Lao fall
 * between phrases rather than between words, and paired two to a row; an odd
 * last ວັກ has a row to itself.
 */
export function versify(selection: string): string {
  const lines = selection
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return selection;

  const divided = lines.some((line) => line.includes('\t') || line.includes(VERSE_COLUMN));
  const rows = divided
    ? lines.map((line) =>
        line
          .split(/\t+|\|/)
          .map((cell) => cell.trim())
          .filter(Boolean),
      )
    : pairs(lines.join(' ').split(/\s+/).filter(Boolean));

  return `${VERSE_OPEN}${rows.map((row) => row.join(` ${VERSE_COLUMN} `)).join('\n')}${VERSE_CLOSE}`;
}

function pairs(phrases: string[]): string[][] {
  const rows: string[][] = [];
  for (let i = 0; i < phrases.length; i += 2) rows.push(phrases.slice(i, i + 2));
  return rows;
}

/** Every verse block put back as running text — ຍົກເລີກກອນ. */
export function unversify(text: string): string {
  BLOCK.lastIndex = 0;
  return text.replace(BLOCK, (_, block: string) =>
    rowsOf(block)
      .map((row) => row.filter(Boolean).join(' '))
      .join(' '),
  );
}
