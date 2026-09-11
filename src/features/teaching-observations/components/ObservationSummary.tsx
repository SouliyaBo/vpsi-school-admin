import { useTranslation } from 'react-i18next';
import { useSubjectGroupOptions } from '@/features/subject-groups/api';
import { cn, formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { FilterSelect, TableToolbar } from '@/components/common/TableToolbar';
import { useState } from 'react';
import { criterionLabel, scoreTone, useObservationSummary } from '../api';

const TONE_CLASS = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

/**
 * ສະຫຼຸບການຕິດຕາມ — the term's visits, one line per teacher.
 *
 * The point of scoring the sheets at all: a stack of filed forms says nothing
 * until it is a table of averages. Weakest first, because the question the
 * academic office opens this with is who needs support — a list ordered by name
 * makes them read all of it to find out, and one ordered by best first answers
 * a question nobody asked.
 *
 * Drafts are excluded by the API, so a teacher's average never moves on a sheet
 * its own author has not yet stood behind.
 */
export function ObservationSummary() {
  const { t, i18n } = useTranslation();
  const [subjectGroupId, setSubjectGroupId] = useState<string | undefined>();
  const groups = useSubjectGroupOptions('');
  const summary = useObservationSummary({ subjectGroupId });

  // `TableSkeleton` emits bare rows for a table that is already on screen; this
  // one is rendered whole or not at all, so its placeholder is a plain block.
  if (summary.isLoading) return <Skeleton className="h-64 w-full" />;
  if (summary.error) return <ErrorState error={summary.error} onRetry={summary.refetch} />;
  if (!summary.data) return null;

  const { criteria, teachers, maxTotal, semester } = summary.data;

  return (
    <div className="space-y-4">
      <TableToolbar
        hasActiveFilters={Boolean(subjectGroupId)}
        onClearFilters={() => setSubjectGroupId(undefined)}
      >
        <Badge variant="outline">
          {i18n.language.startsWith('en') && semester.nameEn ? semester.nameEn : semester.nameLo}
        </Badge>
        <FilterSelect
          value={subjectGroupId}
          onChange={setSubjectGroupId}
          options={groups.data ?? []}
          placeholder={t('observation.subjectGroup')}
        />
      </TableToolbar>

      {teachers.length === 0 ? (
        <EmptyState
          title={t('observation.summaryEmptyTitle')}
          description={t('observation.summaryEmptyDescription')}
        />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="p-2 text-start font-semibold">{t('observation.observedTeacher')}</th>
                <th className="p-2 text-center font-semibold">{t('observation.visits')}</th>
                {criteria.map((criterion) => (
                  <th
                    key={criterion.key}
                    className="p-2 text-center text-xs font-medium"
                    // The full heading, since the column shows only its number.
                    title={criterionLabel(criterion, i18n.language)}
                  >
                    {criterion.order}
                  </th>
                ))}
                <th className="p-2 text-center font-semibold">
                  {t('observation.averageOutOf', { max: maxTotal })}
                </th>
                <th className="p-2 text-start font-semibold">{t('observation.lastVisit')}</th>
              </tr>
            </thead>

            <tbody>
              {teachers.map((teacher) => (
                <tr key={teacher.teacherId} className="border-t border-border">
                  <td className="p-2">
                    <p className="font-medium">
                      {i18n.language.startsWith('en') && teacher.teacherNameEn
                        ? teacher.teacherNameEn
                        : teacher.teacherNameLo}
                    </p>
                    <p className="text-xs text-muted-foreground">{teacher.teacherCode}</p>
                  </td>

                  <td className="p-2 text-center tabular-nums">
                    {teacher.visitCount}
                    {/* How many the teacher has confirmed reading — a visit
                        nobody acknowledged is a conversation that never
                        happened. */}
                    {teacher.acknowledgedCount < teacher.visitCount && (
                      <span className="ms-1 text-xs text-muted-foreground">
                        ({teacher.acknowledgedCount} ✓)
                      </span>
                    )}
                  </td>

                  {criteria.map((criterion) => {
                    const average = teacher.averageByCriterion[criterion.key];
                    return (
                      <td
                        key={criterion.key}
                        className="p-2 text-center tabular-nums text-muted-foreground"
                      >
                        {average ?? '—'}
                      </td>
                    );
                  })}

                  <td className="p-2 text-center">
                    <span
                      className={cn(
                        'font-semibold tabular-nums',
                        teacher.averageTotal !== null &&
                          TONE_CLASS[scoreTone(teacher.averageTotal, maxTotal)],
                      )}
                    >
                      {teacher.averageTotal ?? '—'}
                    </span>
                  </td>

                  <td className="p-2 text-muted-foreground">
                    {formatDate(teacher.lastObservedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
