import { splitVerse } from '../lib/verse';
import { MathText } from './MathText';

/**
 * Question text with its ຄຳກອນ set the way the printer sets it — two ວັກ to a
 * row, the second column lined up — and its formulas drawn.
 */
export function VerseText({ text }: { text: string }) {
  return (
    <div className="space-y-1 rounded-md bg-muted/50 px-2 py-1 text-sm">
      {splitVerse(text).map((part, index) => {
        if (part.kind === 'text') {
          return <MathText key={index} text={part.text} className="block" />;
        }
        const columns = Math.max(...part.rows.map((row) => row.length));
        return (
          <div
            key={index}
            className="grid w-fit gap-x-6 ps-5"
            style={{ gridTemplateColumns: `repeat(${columns}, max-content)` }}
          >
            {part.rows.flatMap((row, r) =>
              // A short last row keeps its cells in their columns.
              Array.from({ length: columns }, (_, c) => (
                <MathText key={`${r}-${c}`} text={row[c] ?? ''} />
              )),
            )}
          </div>
        );
      })}
    </div>
  );
}
