/**
 * ຂີດກ້ອງ in a question — the word a ພາສາລາວ question asks about, as in
 * "ປ້າຂອງຂ້ອຍພວມໄປຕະຫຼາດ — ສ່ວນທີ່ຂີດກ້ອງ…" with ພວມ underlined — printed
 * underlined.
 *
 * Marked in the question text as `[u]ພວມ[/u]`, like the verse markers in
 * `verse.ts`: no new field, and the teacher can see and edit it. The upload
 * keeps the underline a Word file gave a question's words (`underlineChars`);
 * the review page's ຂີດກ້ອງ button adds and removes it.
 *
 * Questions only. In the options an underline is how a teacher marks the right
 * answer, and the parser reads it as that — see `judgeAnswer`.
 *
 * Asked for by the office on 20 Oct 2026, after the upload dropped the
 * underlines a ພາສາລາວ paper's questions turned on.
 *
 * A copy of the API's `exam-papers/underline.ts`, for the review page's button
 * and preview; the two must agree on the markers. The API alone reads Word.
 */

export const UNDERLINE_OPEN = '[u]';
export const UNDERLINE_CLOSE = '[/u]';

const RUN = /\[u\]([\s\S]*?)\[\/u\]/g;

export interface MarkedPiece {
  text: string;
  underline: boolean;
}

export function hasUnderline(text: string): boolean {
  RUN.lastIndex = 0;
  return RUN.test(text);
}

/** The text in runs, each underlined or not; a marker left unclosed is just text. */
export function splitUnderline(text: string): MarkedPiece[] {
  const pieces: MarkedPiece[] = [];
  let last = 0;
  RUN.lastIndex = 0;
  for (const match of text.matchAll(RUN)) {
    const index = match.index ?? 0;
    if (index > last) pieces.push({ text: text.slice(last, index), underline: false });
    if (match[1]) pieces.push({ text: match[1], underline: true });
    last = index + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), underline: false });
  return pieces;
}

/** The words without their markers — for a list showing a question in brief. */
export function stripUnderline(text: string): string {
  RUN.lastIndex = 0;
  return text.replace(RUN, '$1');
}

/**
 * ຂີດກ້ອງ pressed with `text[from, to)` selected: the underline taken off
 * whatever run the selection touches, or — touching none — put on the
 * selection, its edge spaces left out.
 */
export function toggleUnderline(text: string, from: number, to: number): string {
  const runs = [...text.matchAll(RUN)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
    inner: match[1],
  }));
  const touched = runs.filter((run) => run.start < Math.max(to, from + 1) && run.end > from);
  if (touched.length > 0) {
    let out = '';
    let last = 0;
    for (const run of touched) {
      out += text.slice(last, run.start) + run.inner;
      last = run.end;
    }
    return out + text.slice(last);
  }
  const selected = text.slice(from, to);
  const lead = selected.length - selected.trimStart().length;
  const word = selected.trim();
  if (!word) return text;
  const start = from + lead;
  return `${text.slice(0, start)}${UNDERLINE_OPEN}${word}${UNDERLINE_CLOSE}${text.slice(start + word.length)}`;
}
