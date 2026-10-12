import { Users, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useStudentListStats, type GenderCount } from '../api';

/** What a click on the age row picks: an exact age, "under 11", or nothing. */
export type AgePick = { age: number } | { under: number } | null;

/**
 * The headcount above the student list.
 *
 * Counts the same filters the table is showing, so picking ມ.1/ກ turns it into
 * ມ.1/ກ's headcount. The age row is the one part that is clickable: a bucket
 * narrows the table to the children in it, and clicking it again lets go. The
 * age filter itself is not applied to the figures — narrowing them to one age
 * would empty every other bucket and leave nothing to click back to.
 */
export function StudentStats({
  params,
  selectedAge,
  selectedUnder,
  onPickAge,
}: {
  /** The list's filters, without paging, sorting or the age filters. */
  params: Record<string, unknown>;
  selectedAge?: number;
  selectedUnder?: number;
  onPickAge: (pick: AgePick) => void;
}) {
  const { t } = useTranslation();
  const stats = useStudentListStats(params);
  // A payload without the age rows is not a headcount; showing nothing beats
  // taking the student list down with it.
  const data = Array.isArray(stats.data?.ages) ? stats.data : undefined;

  const split = (count: GenderCount) =>
    t('student.stats.split', { female: count.female, male: count.male });

  const buckets: {
    key: string;
    label: string;
    count: GenderCount;
    selected: boolean;
    pick: AgePick;
  }[] = data
    ? [
        ...(data.under.total > 0 || selectedUnder
          ? [
              {
                key: 'under',
                label: t('person.ageUnder', { age: data.ages[0]?.age ?? 11 }),
                count: data.under,
                selected: Boolean(selectedUnder),
                pick: { under: data.ages[0]?.age ?? 11 },
              },
            ]
          : []),
        ...data.ages.map((row) => ({
          key: String(row.age),
          label: t('person.ageYears', { age: row.age }),
          count: row,
          selected: selectedAge === row.age,
          pick: { age: row.age },
        })),
      ]
    : [];

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure
          icon={Users}
          label={t('student.stats.total')}
          value={data?.total}
          loading={stats.isLoading}
        />
        <Figure
          icon={UserRound}
          label={t('student.stats.female')}
          value={data?.female}
          loading={stats.isLoading}
        />
        <Figure
          icon={UserRound}
          label={t('student.stats.male')}
          value={data?.male}
          loading={stats.isLoading}
        />
      </div>

      <Card>
        <CardContent className="space-y-2 pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-medium">{t('student.stats.byAge')}</p>
            <p className="text-xs text-muted-foreground">{t('student.stats.byAgeHint')}</p>
          </div>
          {stats.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-11">
              {buckets.map((bucket) => (
                <button
                  key={bucket.key}
                  type="button"
                  aria-pressed={bucket.selected}
                  onClick={() => onPickAge(bucket.selected ? null : bucket.pick)}
                  className={cn(
                    'rounded-md border px-2 py-2 text-start transition-colors hover:border-primary/40',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    bucket.selected && 'border-primary bg-primary-subtle',
                    bucket.count.total === 0 && !bucket.selected && 'opacity-60',
                  )}
                >
                  <span className="block text-xs text-muted-foreground">{bucket.label}</span>
                  <span className="block text-lg font-semibold tabular-nums">
                    {bucket.count.total}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {split(bucket.count)}
                  </span>
                </button>
              ))}
            </div>
          )}
          {data && (data.over.total > 0 || data.unknown.total > 0) && (
            <p className="text-xs text-muted-foreground">
              {[
                data.over.total > 0 &&
                  t('student.stats.over', {
                    age: data.ages[data.ages.length - 1]?.age ?? 20,
                    n: data.over.total,
                  }),
                data.unknown.total > 0 && t('student.stats.unknown', { n: data.unknown.total }),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Figure({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: typeof Users;
  label: string;
  value: number | undefined;
  loading: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 pt-5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary">
          <Icon className="size-5" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1 h-7 w-16" />
          ) : (
            <p className="text-2xl font-semibold tabular-nums">{(value ?? 0).toLocaleString()}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
