import { useTranslation } from 'react-i18next';
import { FilterSelect } from '@/components/common/TableToolbar';

/** Calendar months, as the checklist counts them. */
export const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/**
 * Year and month, side by side.
 *
 * Numeric rather than named months: the catalogue carries no month names, and a
 * checklist headed "8/2026" is unambiguous in either language — which matters
 * more here than prose, since the office reads it against a printed calendar.
 */
export function MonthPicker({
  year,
  month,
  years,
  onChange,
}: {
  year: number;
  month: number;
  /** Years the active semester spans. */
  years: number[];
  onChange: (next: { year: number; month: number }) => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <FilterSelect
        value={String(month)}
        onChange={(value) => onChange({ year, month: Number(value ?? month) })}
        options={MONTHS.map((entry) => ({ value: String(entry), label: String(entry) }))}
        placeholder={t('lessonPlan.month')}
      />
      <FilterSelect
        value={String(year)}
        onChange={(value) => onChange({ year: Number(value ?? year), month })}
        options={years.map((entry) => ({ value: String(entry), label: String(entry) }))}
        placeholder={t('lessonPlan.year')}
      />
    </div>
  );
}
