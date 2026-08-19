import { CalendarX2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import {
  entriesForDay,
  formatPeriodTime,
  rotationPartners,
  visibleDays,
  weekdayKey,
  type TimetableEntry,
} from '../schedule';

interface Props {
  entries: TimetableEntry[];
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Shown when nothing has been picked yet, in place of the grid. */
  hint?: string;
  /** The card's headline — the subject, on both views. */
  primary: (entry: TimetableEntry) => ReactNode;
  /** The other axis: the class on a teacher's week, the teacher on a class's. */
  secondary: (entry: TimetableEntry) => ReactNode;
  /**
   * Names what a swap slot alternates with — the other class on a teacher's
   * week, the other subject on a class's. Given every partner found in the week
   * on screen; return nothing to fall back to an unqualified marker.
   */
  rotationPartner?: (partners: TimetableEntry[]) => string | null;
}

/**
 * One week, as a column per day.
 *
 * Columns rather than a fixed period × day matrix: periods are stored as free
 * times, not as slots in a school-wide bell schedule, so there is no row axis to
 * align on. Sorting each day by start time gives the same reading order without
 * inventing one.
 */
export function TimetableGrid({
  entries,
  isLoading,
  error,
  onRetry,
  hint,
  primary,
  secondary,
  rotationPartner,
}: Props) {
  const { t } = useTranslation();

  if (hint) return <EmptyState icon={CalendarX2} title={hint} />;

  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (error) return <ErrorState error={error} onRetry={onRetry} compact />;
  if (entries.length === 0) return <EmptyState icon={CalendarX2} title={t('assignment.noSchedule')} />;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {visibleDays(entries).map((day) => {
        const dayEntries = entriesForDay(entries, day);

        return (
          <div key={day} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t(weekdayKey(day))}
            </h3>

            {dayEntries.length === 0 ? (
              <p className="rounded-md border border-dashed border-border px-2 py-3 text-center text-xs text-muted-foreground">
                —
              </p>
            ) : (
              dayEntries.map((entry) => {
                // Resolved against the whole week, not just this day's column,
                // so a partner is found wherever the grid happens to place it.
                const partner = entry.period.isRotating
                  ? (rotationPartner?.(rotationPartners(entries, entry)) ?? null)
                  : null;

                return (
                <div
                  key={`${entry.assignment.id}-${entry.period.dayOfWeek}-${entry.period.startTime}`}
                  className="space-y-0.5 rounded-md border border-border bg-card p-2 shadow-sm"
                >
                  <p className="flex items-baseline justify-between gap-1 text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatPeriodTime(entry.period)}</span>
                    {entry.period.periodNumber != null && (
                      <span className="shrink-0">#{entry.period.periodNumber}</span>
                    )}
                  </p>
                  {/* Without this, a swap slot reads as a bug: two lessons at the
                      same hour with nothing to say they take turns. Naming the
                      other side answers the next question in the same breath —
                      an unqualified "swap slot" only prompts "with what?". */}
                  {entry.period.isRotating && (
                    <Badge variant="secondary" className="text-[0.65rem]">
                      {partner ? t('assignment.rotatingWith', { partner }) : t('assignment.rotating')}
                    </Badge>
                  )}
                  <p className="text-sm font-medium leading-tight">{primary(entry)}</p>
                  <p className="text-xs text-muted-foreground">{secondary(entry)}</p>
                  {entry.period.room && (
                    <p className="text-xs text-muted-foreground">
                      {t('assignment.room')}: {entry.period.room}
                    </p>
                  )}
                </div>
                );
              })
            )}
          </div>
        );
      })}
    </div>
  );
}
