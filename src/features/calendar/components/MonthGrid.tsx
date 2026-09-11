import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { SchoolDay } from '@/types/entities';
import { dayCellClass } from '../legend';

/**
 * One month, laid out Monday-first like the printed sheet.
 *
 * Monday-first and not Sunday-first because that is how the paper reads and how
 * `lesson-plan-weeks` defines a school week; a grid that started on Sunday would
 * put the weekend's two greyed cells on either end of the row and make a Friday
 * lesson's Monday deadline look like it crossed two weeks.
 *
 * Serves both views: the year overview renders twelve of these at `compact`, and
 * the month view one at full size with the event titles written into the cells.
 */

export interface MonthGridProps {
  /** Any date inside the month to draw. */
  month: Date;
  days: Map<string, SchoolDay>;
  compact?: boolean;
  today?: string;
  selected?: string | null;
  onSelect?: (date: string) => void;
}

/** `yyyy-MM-dd` of a UTC-midnight date, the key the API returns days under. */
function key(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The cells of the grid: the month's days, padded to whole Monday–Sunday weeks.
 *
 * Padding days are rendered blank rather than showing the adjacent month's
 * numbers — twelve grids side by side, each ending in another month's dates, is a
 * page nobody can count days on.
 */
function monthCells(month: Date): (Date | null)[] {
  const year = month.getUTCFullYear();
  const index = month.getUTCMonth();
  const first = new Date(Date.UTC(year, index, 1));
  const dayCount = new Date(Date.UTC(year, index + 1, 0)).getUTCDate();

  // `getUTCDay()` is 0 for Sunday, which sits at the end of a Monday-first week.
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (Date | null)[] = Array.from({ length: lead }, () => null);
  for (let day = 1; day <= dayCount; day += 1) {
    cells.push(new Date(Date.UTC(year, index, day)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function MonthGrid({
  month,
  days,
  compact = false,
  today,
  selected,
  onSelect,
}: MonthGridProps) {
  const { t, i18n } = useTranslation();
  const cells = monthCells(month);

  const monthName = new Intl.DateTimeFormat(i18n.language === 'lo' ? 'lo-LA' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(month);

  return (
    <div className={cn('min-w-0', compact && 'text-[11px]')}>
      <div
        className={cn(
          'mb-1 font-medium text-foreground',
          compact ? 'text-xs' : 'mb-2 text-base',
        )}
      >
        {monthName}
      </div>

      <div className="grid grid-cols-7 gap-px" role="grid" aria-label={monthName}>
        {[1, 2, 3, 4, 5, 6, 0].map((weekday) => (
          <div
            key={weekday}
            className={cn(
              'pb-1 text-center font-medium text-muted-foreground',
              compact ? 'text-[10px]' : 'text-xs',
            )}
          >
            {t(`calendar.weekdayShort.${weekday}`)}
          </div>
        ))}

        {cells.map((date, index) => {
          if (!date) return <div key={`pad-${index}`} aria-hidden />;

          const dateKey = key(date);
          const day = days.get(dateKey);
          const state = day?.state ?? 'teaching';
          const events = day?.events ?? [];
          const label = events[0]
            ? (i18n.language === 'lo' ? events[0].titleLo : events[0].titleEn) ||
              events[0].titleLo
            : null;

          return (
            <button
              key={dateKey}
              type="button"
              onClick={() => onSelect?.(dateKey)}
              // A day the calendar has nothing to say about is still clickable —
              // that is how an event gets added to it.
              title={label ?? undefined}
              aria-label={`${dateKey}${label ? ` — ${label}` : ''}`}
              className={cn(
                'relative rounded-sm border border-transparent text-start transition-colors',
                'hover:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                dayCellClass(state, events),
                compact ? 'aspect-square p-0.5 text-center' : 'min-h-[4.5rem] p-1.5',
                day?.isHalfDay && 'ring-1 ring-inset ring-foreground/25',
                dateKey === today && 'border-primary font-semibold',
                dateKey === selected && 'border-foreground',
              )}
            >
              <span className={cn('tabular-nums', compact ? 'text-[10px]' : 'text-xs')}>
                {date.getUTCDate()}
              </span>
              {!compact && label && (
                <span className="mt-0.5 line-clamp-3 block text-[11px] leading-tight">
                  {label}
                </span>
              )}
              {!compact && events.length > 1 && (
                <span className="mt-0.5 block text-[10px] opacity-70">
                  {t('calendar.moreEvents', { count: events.length - 1 })}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
