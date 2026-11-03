import { toggleRun } from './underline';

/**
 * ຕົວຍົກ and ຕົວຫ້ອຍ — superscript and subscript: `3 × 10⁸ m/s`, `H₂O`.
 *
 * Word keeps them as a property of the run (`<w:vertAlign w:val=
 * "superscript"/>`); read as plain characters, `10` with a raised `8` became
 * `108` and a ຟີຊິກ answer changed its value (the office, 20 Oct 2026). Marked
 * in the text as `10[sup]8[/sup]` and `H[sub]2[/sub]O`, like `[u]…[/u]`, in
 * questions and options alike — unlike an underline, a raised figure is never
 * how the right answer is marked.
 *
 * The ready-made characters (² ³ ⁸ ₂ …) are folded into the same markers at
 * upload (`foldUnicodeScripts`): the printer then sets an ordinary figure small
 * and raised, rather than needing a face that happens to have ⁸ — Times New
 * Roman Bold does not.
 *
 * A copy of the API's `exam-papers/script.ts`, for the review page's buttons
 * and preview; the two must agree on the markers. The API alone reads Word.
 */

export type Script = 'sup' | 'sub';

const RUN = /\[(sup|sub)\]([\s\S]*?)\[\/\1\]/g;

export interface ScriptPiece {
  text: string;
  script: Script | null;
}

export function hasScript(text: string): boolean {
  RUN.lastIndex = 0;
  return RUN.test(text);
}

/** The text in runs, each raised, lowered or level; an unclosed marker is just text. */
export function splitScript(text: string): ScriptPiece[] {
  const pieces: ScriptPiece[] = [];
  let last = 0;
  RUN.lastIndex = 0;
  for (const match of text.matchAll(RUN)) {
    const index = match.index ?? 0;
    if (index > last) pieces.push({ text: text.slice(last, index), script: null });
    if (match[2]) pieces.push({ text: match[2], script: match[1] as Script });
    last = index + match[0].length;
  }
  if (last < text.length) pieces.push({ text: text.slice(last), script: null });
  return pieces;
}

/** For a list that shows a question in one line: `10^8`, `H_2O`. */
export function flattenScript(text: string): string {
  RUN.lastIndex = 0;
  return text.replace(RUN, (_, kind: string, inner: string) =>
    kind === 'sup' ? `^${inner}` : `_${inner}`,
  );
}

/** ຕົວຍົກ or ຕົວຫ້ອຍ pressed with `text[from, to)` selected — see `toggleRun`. */
export function toggleScript(text: string, from: number, to: number, script: Script): string {
  const pattern = script === 'sup' ? /\[sup\]([\s\S]*?)\[\/sup\]/ : /\[sub\]([\s\S]*?)\[\/sub\]/;
  return toggleRun(text, from, to, pattern, `[${script}]`, `[/${script}]`);
}
