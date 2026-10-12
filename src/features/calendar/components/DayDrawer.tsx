import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn, formatDate } from '@/lib/utils';
import type { DayState } from '@/types/enums';
import type { CalendarEvent, SchoolDay } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DetailDrawer } from '@/components/common/DetailDrawer';
import { DAY_EFFECT_TONE, eventStyle } from '../legend';

/**
 * One day, read before it is touched.
 *
 * A click on the grid used to open the form straight away — the covering event's
 * edit form, or a blank one on an empty day. That made looking at a day and
 * changing it the same gesture, and the office looks far more often than it
 * changes: "what is on the 8th?" was answered by a form with a Save button. So
 * the click opens this instead: the date in words, what the day is to the
 * school, everything filed on it, and only then the buttons that change any of
 * it.
 */

export interface DayDrawerProps {
  /** `yyyy-MM-dd`; `null` closes the drawer. */
  date: string | null;
  onClose: () => void;
  day?: SchoolDay;
  /** The full records of the day's events, most restrictive first. */
  events: CalendarEvent[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  onCreate: (date: string) => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}

const STATE_TONE: Record<DayState, 'success' | 'warning' | 'danger' | 'secondary'> = {
  teaching: 'success',
  no_classes: 'warning',
  closed: 'danger',
  weekend: 'secondary',
  out_of_year: 'secondary',
};

/** `ວັນອັງຄານ 8 ທັນວາ 2026` — the whole date, in the reader's language. */
const fullDate = (date: string, language: string) =>
  new Intl.DateTimeFormat(language === 'lo' ? 'lo-LA' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

export function DayDrawer({
  date,
  onClose,
  day,
  events,
  canCreate,
  canUpdate,
  canDelete,
  onCreate,
  onEdit,
  onDelete,
}: DayDrawerProps) {
  const { t, i18n } = useTranslation();

  // A day the API did not classify (it is outside the fetched range) is drawn
  // as an ordinary one rather than left blank.
  const state = day?.state ?? 'teaching';

  return (
    <DetailDrawer
      open={date !== null}
      onOpenChange={(open) => !open && onClose()}
      title={date ? fullDate(date, i18n.language) : ''}
      description={date ?? undefined}
      footer={
        canCreate && date ? (
          <Button onClick={() => onCreate(date)}>
            <Plus className="size-4" />
            {t('calendar.addEventOnDay')}
          </Button>
        ) : undefined
      }
    >
      {date && (
        <div className="space-y-5">
          {/* What the day is to the school — the one line the reports read. */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATE_TONE[state]}>{t(`calendar.dayState.${state}`)}</Badge>
            {day?.isHalfDay && <Badge variant="outline">{t('calendar.halfDay')}</Badge>}
          </div>

          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('calendar.dayEmpty')}</p>
          ) : (
            <ul className="space-y-3">
              {events.map((event) => {
                const oneDay = event.startDate.slice(0, 10) === event.endDate.slice(0, 10);
                return (
                  <li key={event.id} className="rounded-md border border-border p-3 text-sm">
                    <div className="flex items-start gap-2.5">
                      <span
                        className={cn('mt-1 size-3 shrink-0 rounded-sm', eventStyle(event.type).swatch)}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="font-medium">{event.titleLo}</div>
                        {event.titleEn && (
                          <div className="text-xs text-muted-foreground">{event.titleEn}</div>
                        )}
                        <div className="text-xs text-muted-foreground">
                          {t(`calendar.type.${event.type}`)}
                          {' · '}
                          <span className="tabular-nums">
                            {oneDay
                              ? formatDate(event.startDate)
                              : `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pt-1">
                          <Badge variant={DAY_EFFECT_TONE[event.dayEffect]}>
                            {t(`calendar.dayEffect.${event.dayEffect}`)}
                          </Badge>
                          {event.isHalfDay && <Badge variant="outline">{t('calendar.halfDay')}</Badge>}
                          {/* Without this the row reads as a school-wide
                              closure, which is the one thing it is not — the
                              grid deliberately leaves these days open. */}
                          {isClassScoped(event) && (
                            <Badge variant="secondary">{t('calendar.appliesToBadge')}</Badge>
                          )}
                        </div>
                        {event.description && (
                          <p className="whitespace-pre-line pt-1 text-sm text-foreground/80">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {(canUpdate || canDelete) && (
                      <div className="mt-3 flex justify-end gap-2 border-t border-border pt-2">
                        {canUpdate && (
                          <Button size="sm" variant="outline" onClick={() => onEdit(event)}>
                            <Pencil className="size-4" />
                            {t('common.edit')}
                          </Button>
                        )}
                        {canDelete && (
                          <Button size="sm" variant="ghost" onClick={() => onDelete(event)}>
                            <Trash2 className="size-4 text-danger" />
                            {t('common.delete')}
                          </Button>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </DetailDrawer>
  );
}

/** Whether the event closes named classes rather than the whole school. */
function isClassScoped(event: CalendarEvent): boolean {
  return (
    (event.appliesToGradeLevelIds?.length ?? 0) > 0 ||
    (event.appliesToClassroomIds?.length ?? 0) > 0
  );
}
