import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { splitUnderline } from '../lib/underline';

/**
 * Question text with its `$…$` formulas drawn, as the printer will draw
 * them. A formula KaTeX cannot read is shown as it was typed, in red, so the
 * teacher sees what to fix; the printer prints that one as typed too.
 * Words inside `[u]…[/u]` are underlined, as printed.
 */

const MATH = /\$\$([^$]+?)\$\$|\$([^$\n]+?)\$/g;

export function hasMath(text: string): boolean {
  MATH.lastIndex = 0;
  return MATH.test(text);
}

interface Part {
  key: number;
  text?: string;
  html?: string;
  invalid?: string;
}

function parts(text: string): Part[] {
  const out: Part[] = [];
  let last = 0;
  let key = 0;
  MATH.lastIndex = 0;
  for (const match of text.matchAll(MATH)) {
    const index = match.index ?? 0;
    const tex = (match[1] ?? match[2]).trim();
    if (!tex) continue;
    if (index > last) out.push({ key: key++, text: text.slice(last, index) });
    try {
      out.push({
        key: key++,
        html: katex.renderToString(tex, { displayMode: false, throwOnError: true, output: 'html' }),
      });
    } catch {
      out.push({ key: key++, invalid: match[0] });
    }
    last = index + match[0].length;
  }
  if (last < text.length) out.push({ key: key++, text: text.slice(last) });
  return out;
}

export function MathText({ text, className }: { text: string; className?: string }) {
  const pieces = useMemo(
    () => splitUnderline(text).map((piece) => ({ ...piece, parts: parts(piece.text) })),
    [text],
  );
  return (
    <span className={cn('whitespace-pre-wrap', className)}>
      {pieces.map((piece, index) =>
        piece.underline ? (
          <u key={index} className="underline-offset-4">
            <Parts parts={piece.parts} />
          </u>
        ) : (
          <Parts key={index} parts={piece.parts} />
        ),
      )}
    </span>
  );
}

function Parts({ parts: rendered }: { parts: Part[] }) {
  return (
    <>
      {rendered.map((part) =>
        part.html !== undefined ? (
          // KaTeX escapes what it does not typeset, so its markup is safe to set.
          <span key={part.key} dangerouslySetInnerHTML={{ __html: part.html }} />
        ) : part.invalid !== undefined ? (
          <span key={part.key} className="text-danger" title="LaTeX">
            {part.invalid}
          </span>
        ) : (
          <span key={part.key}>{part.text}</span>
        ),
      )}
    </>
  );
}
