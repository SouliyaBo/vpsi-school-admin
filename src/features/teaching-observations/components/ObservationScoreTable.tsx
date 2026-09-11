import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import {
  criterionIndicators,
  criterionLabel,
  scoreTone,
  type ObservationCriterion,
} from '../api';

/**
 * Tone → class, written out in full.
 *
 * Tailwind scans source text for class names, so an interpolated
 * `text-${tone}` compiles to nothing at all and the total renders unstyled.
 */
const TONE_CLASS = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

/**
 * The body of ຮ່າງການຕິດຕາມການສອນຂອງຄູສອນ — the six criteria and their marks.
 *
 * One component for both the entry form and the filed sheet, because they are
 * the same table: the paper form is read by the observer while scoring and by
 * the teacher afterwards, and two implementations would eventually disagree
 * about what row four says. `onChange` is what tells them apart — omit it and
 * the marks render as text.
 *
 * The three printed columns are kept in their printed order (ດ້ານການຕິດຕາມ,
 * ການປະເມີນ, ຄະແນນ) so that somebody holding the paper can follow along, and
 * the two indicator lines stay separate rows within column two, as they are on
 * the form: they are what the observer reads to decide the one mark, not two
 * sub-scores.
 */

interface Props {
  criteria: ObservationCriterion[];
  /** The mark per criterion key; `null` or absent is unmarked, not zero. */
  values: Record<string, number | null | undefined>;
  /** Omit for a read-only sheet. */
  onChange?: (criterion: string, score: number | null) => void;
  criterionMaxScore: number;
  maxTotal: number;
  disabled?: boolean;
}

export function ObservationScoreTable({
  criteria,
  values,
  onChange,
  criterionMaxScore,
  maxTotal,
  disabled = false,
}: Props) {
  const { t, i18n } = useTranslation();
  const editable = Boolean(onChange);

  const marked = criteria
    .map((criterion) => values[criterion.key])
    .filter((score): score is number => score !== null && score !== undefined);

  const total = marked.reduce((sum, score) => sum + score, 0);
  // Out of what has actually been marked, so a half-filled sheet is not read as
  // a bad one. The head line still says what a complete sheet is worth.
  const outOf = marked.length * criterionMaxScore;

  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50 text-start">
            <th className="w-48 border-b border-e border-border p-2 text-start font-semibold">
              {t('observation.criterionColumn')}
            </th>
            <th className="border-b border-e border-border p-2 text-start font-semibold">
              {t('observation.indicatorColumn')}
            </th>
            <th className="w-28 border-b border-border p-2 text-center font-semibold">
              {t('observation.scoreColumn', { max: criterionMaxScore })}
            </th>
          </tr>
        </thead>

        <tbody>
          {criteria.map((criterion) => {
            const value = values[criterion.key];
            const indicators = criterionIndicators(criterion, i18n.language);

            return (
              <tr key={criterion.key} className="align-top">
                <th
                  scope="row"
                  className="border-b border-e border-border p-2 text-start font-medium"
                >
                  <span className="text-muted-foreground">{criterion.order}.</span>{' '}
                  {criterionLabel(criterion, i18n.language)}
                </th>

                <td className="border-b border-e border-border p-0">
                  {indicators.map((indicator, index) => (
                    <p
                      key={indicator}
                      className={cn(
                        'px-2 py-1.5 leading-snug',
                        // The form rules between the two lines but not below the
                        // second — that border is the row's own.
                        index === 0 && 'border-b border-border',
                      )}
                    >
                      {indicator}
                    </p>
                  ))}
                </td>

                <td className="border-b border-border p-2 text-center">
                  {editable ? (
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={criterionMaxScore}
                      step={0.5}
                      disabled={disabled}
                      aria-label={criterionLabel(criterion, i18n.language)}
                      value={value ?? ''}
                      onChange={(event) => {
                        const raw = event.target.value;
                        if (raw === '') {
                          // Clearing a box means "not marked yet", which is what
                          // the API stores — never a mark of zero.
                          onChange?.(criterion.key, null);
                          return;
                        }
                        const parsed = Number(raw);
                        if (Number.isNaN(parsed)) return;
                        onChange?.(
                          criterion.key,
                          Math.min(criterionMaxScore, Math.max(0, parsed)),
                        );
                      }}
                      className="mx-auto w-20 text-center"
                    />
                  ) : (
                    <span className="font-medium tabular-nums">
                      {value ?? <span className="text-muted-foreground">—</span>}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}

          <tr className="bg-muted/40">
            <th colSpan={2} scope="row" className="border-e border-border p-2 text-start font-semibold">
              {t('observation.totalRow')}
            </th>
            <td className="p-2 text-center">
              <span
                className={cn(
                  'font-semibold tabular-nums',
                  outOf > 0 && TONE_CLASS[scoreTone(total, outOf)],
                )}
              >
                {total}
              </span>
              <span className="text-muted-foreground"> / {outOf || maxTotal}</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
