import { zodResolver } from '@hookform/resolvers/zod';
import { ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCan } from '@/features/auth/hooks';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { stripEmpty } from '@/lib/payload';
import { cn, formatDate, toDateInput } from '@/lib/utils';
import { endAfterStart, endAfterStartIssue, optionalText, requiredDate, requiredText } from '@/lib/zod-helpers';
import { CALENDAR_EVENT_TYPES, DEFAULT_DAY_EFFECT, SCHOOL_DAY_EFFECTS } from '@/types/enums';
import type { CalendarEvent, SchoolDay } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import {
  CheckboxField,
  DateField,
  FieldSection,
  SelectField,
  TextareaField,
  TextField,
} from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { calendarEvents, useSchoolDays, type CalendarEventInput } from '../api';
import { MonthGrid } from '../components/MonthGrid';
import { DAY_EFFECT_TONE, eventStyle, LEGEND_TYPES } from '../legend';

/**
 * ປະຕິທິນໂຮງຮຽນ — the school year as the office publishes it.
 *
 * This screen is not decoration. Until it was filled in, every count of school
 * days in the system was a count of weekdays: the roll-call and behaviour-register
 * coverage reports expected a lesson on every timetabled weekday and so named the
 * whole staff for the week of ບຸນປີໃໝ່, and there was no way to say that an exam
 * week is a week nobody owes a register for. `dayEffect` is what those reports
 * read, which is why it is a field on the form and not a detail — see
 * `common/school-days` on the API.
 *
 * Two views, because the office does two different things here. The year is for
 * checking the screen against the printed sheet, twelve months at a glance in the
 * paper's own colours. The month is for editing — the one where an event's title
 * fits inside the day.
 */

const schema = z
  .object({
    titleLo: requiredText(200),
    titleEn: optionalText(200),
    description: optionalText(2000),
    type: z.enum(CALENDAR_EVENT_TYPES),
    dayEffect: z.enum(SCHOOL_DAY_EFFECTS),
    startDate: requiredDate(),
    endDate: requiredDate(),
    isHalfDay: z.boolean(),
  })
  .refine(endAfterStart, endAfterStartIssue);

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  titleLo: '',
  titleEn: '',
  description: '',
  type: 'holiday',
  dayEffect: 'closed',
  startDate: '',
  endDate: '',
  isHalfDay: false,
};

const EMPTY_DAYS: Map<string, SchoolDay> = new Map();

/** `yyyy-MM-dd`, in UTC — the keys the API classifies days under. */
const key = (date: Date) => date.toISOString().slice(0, 10);

/**
 * `September 2026`, in the reader's language.
 *
 * Not `formatDate`, which takes a date-fns pattern and is pinned to English: a
 * month name is the one date string on this screen that has to be Lao for a Lao
 * reader, and `Intl` is what knows how.
 */
const monthLabel = (date: Date, language: string) =>
  new Intl.DateTimeFormat(language === 'lo' ? 'lo-LA' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const dialogs = useCrudDialogs<CalendarEvent>();
  const [view, setView] = useState<'year' | 'month'>('year');
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  });

  const activeYear = useActiveSchoolYear();

  /**
   * The range the grid asks the API to classify.
   *
   * The year view spans the school year rather than January–December: the sheet
   * runs August to July and a calendar year would cut it in half. It falls back to
   * the twelve months around the cursor before the active year has loaded.
   */
  const range = useMemo(() => {
    if (view === 'month') {
      const start = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
      const end = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
      return { from: key(start), to: key(end) };
    }
    const year = activeYear.data;
    if (year) return { from: toDateInput(year.startDate), to: toDateInput(year.endDate) };
    const start = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), 1));
    return { from: key(start), to: key(new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), 0))) };
  }, [view, cursor, activeYear.data]);

  const days = useSchoolDays(range.from, range.to);
  const list = calendarEvents.useList({
    from: range.from,
    to: range.to,
    limit: 200,
    sortBy: 'startDate',
    sortOrder: 'asc',
  });

  const create = calendarEvents.useCreate();
  const update = calendarEvents.useUpdate();
  const remove = calendarEvents.useDelete();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  // Picking a type moves the effect with it, so the common case is one choice.
  // Only when the type changes, so an office that deliberately set `open` on a
  // holiday does not have it reset under them as they finish the form.
  const watchedType = form.watch('type');
  useEffect(() => {
    if (!dialogs.formOpen || !form.formState.dirtyFields.type) return;
    form.setValue('dayEffect', DEFAULT_DAY_EFFECT[watchedType]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedType]);

  useEffect(() => {
    if (!dialogs.formOpen) return;
    form.reset(
      dialogs.record
        ? {
            titleLo: dialogs.record.titleLo,
            titleEn: dialogs.record.titleEn ?? '',
            description: dialogs.record.description ?? '',
            type: dialogs.record.type,
            dayEffect: dialogs.record.dayEffect,
            startDate: toDateInput(dialogs.record.startDate),
            endDate: toDateInput(dialogs.record.endDate),
            isHalfDay: dialogs.record.isHalfDay ?? false,
          }
        : EMPTY,
    );
  }, [dialogs.formOpen, dialogs.record, form]);

  /** A click on a day: edit what is on it, or start a one-day event on it. */
  const openDay = (date: string) => {
    const existing = list.data?.data.find(
      (event) => event.startDate.slice(0, 10) <= date && event.endDate.slice(0, 10) >= date,
    );
    if (existing) {
      dialogs.openEdit(existing);
      return;
    }
    if (!can('calendar', 'create')) return;
    dialogs.openCreate();
    form.reset({ ...EMPTY, startDate: date, endDate: date });
  };

  const submit = form.handleSubmit((values) => {
    const payload = stripEmpty(values) as CalendarEventInput;
    const done = () => dialogs.closeForm();
    if (dialogs.record) update.mutate({ id: dialogs.record.id, body: payload }, { onSuccess: done });
    else create.mutate(payload, { onSuccess: done });
  });

  const months = useMemo(() => {
    const from = new Date(`${range.from}T00:00:00Z`);
    const to = new Date(`${range.to}T00:00:00Z`);
    const out: Date[] = [];
    let month = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (month <= to) {
      out.push(month);
      month = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));
    }
    return out;
  }, [range]);

  const today = key(new Date());
  // A stable fallback: `?? new Map()` is a new object each render, which would
  // make the summary below recount on every one of them.
  const dayMap = days.data ?? EMPTY_DAYS;

  const counts = useMemo(() => {
    let teaching = 0;
    let noClasses = 0;
    let closed = 0;
    for (const day of dayMap.values()) {
      if (day.state === 'teaching') teaching += 1;
      else if (day.state === 'no_classes') noClasses += 1;
      else if (day.state === 'closed') closed += 1;
    }
    return { teaching, noClasses, closed };
  }, [dayMap]);

  const typeOptions = CALENDAR_EVENT_TYPES.map((type) => ({
    value: type,
    label: t(`calendar.type.${type}`),
  }));
  const effectOptions = SCHOOL_DAY_EFFECTS.map((effect) => ({
    value: effect,
    label: t(`calendar.dayEffect.${effect}`),
  }));

  const shiftMonth = (step: number) =>
    setCursor((current) => new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + step, 1)));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.calendar')}
        description={t('calendar.pageDescription')}
        actions={
          can('calendar', 'create') && (
            <Button onClick={() => dialogs.openCreate()}>
              <Plus className="size-4" />
              {t('calendar.addEvent')}
            </Button>
          )
        }
      />

      <Card>
        <CardContent className="space-y-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
              {(['year', 'month'] as const).map((option) => (
                <Button
                  key={option}
                  size="sm"
                  variant={view === option ? 'default' : 'ghost'}
                  onClick={() => setView(option)}
                >
                  {t(`calendar.view.${option}`)}
                </Button>
              ))}
            </div>

            {view === 'month' ? (
              <div className="flex items-center gap-2">
                <Button size="icon" variant="outline" onClick={() => shiftMonth(-1)} aria-label={t('common.previous')}>
                  <ChevronLeft className="size-4" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => shiftMonth(0)}>
                  {monthLabel(cursor, i18n.language)}
                </Button>
                <Button size="icon" variant="outline" onClick={() => shiftMonth(1)} aria-label={t('common.next')}>
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {formatDate(range.from)} – {formatDate(range.to)}
              </div>
            )}

            {/* The three numbers every other menu counts against. */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="success">{t('calendar.teachingDays', { count: counts.teaching })}</Badge>
              <Badge variant="warning">{t('calendar.noClassDays', { count: counts.noClasses })}</Badge>
              <Badge variant="danger">{t('calendar.closedDays', { count: counts.closed })}</Badge>
            </div>
          </div>

          {/* The sheet's legend, in the sheet's order. */}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
            {LEGEND_TYPES.map((type) => (
              <span key={type} className="flex items-center gap-1.5">
                <span className={cn('size-3 rounded-sm', eventStyle(type).swatch)} />
                {t(`calendar.type.${type}`)}
              </span>
            ))}
          </div>

          {days.isError ? (
            <ErrorState error={days.error} onRetry={() => days.refetch()} />
          ) : days.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : view === 'year' ? (
            <div className="grid gap-x-5 gap-y-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {months.map((month) => (
                <MonthGrid
                  key={key(month)}
                  month={month}
                  days={dayMap}
                  compact
                  today={today}
                  onSelect={openDay}
                />
              ))}
            </div>
          ) : (
            <MonthGrid month={cursor} days={dayMap} today={today} onSelect={openDay} />
          )}
        </CardContent>
      </Card>

      {/* The list, because a colour says a day is unusual and only a title says why. */}
      <Card>
        <CardContent className="p-0">
          {list.isLoading ? (
            <Skeleton className="m-4 h-40" />
          ) : !list.data?.data.length ? (
            <EmptyState title={t('calendar.empty')} description={t('calendar.emptyHint')} />
          ) : (
            <ul className="divide-y divide-border">
              {list.data.data.map((event) => (
                <li key={event.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className={cn('size-3 shrink-0 rounded-sm', eventStyle(event.type).swatch)} />
                  <span className="w-40 shrink-0 tabular-nums text-muted-foreground">
                    {event.startDate.slice(0, 10) === event.endDate.slice(0, 10)
                      ? formatDate(event.startDate)
                      : `${formatDate(event.startDate)} – ${formatDate(event.endDate)}`}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{event.titleLo}</span>
                    {event.titleEn && (
                      <span className="block truncate text-xs text-muted-foreground">{event.titleEn}</span>
                    )}
                  </span>
                  <Badge variant={DAY_EFFECT_TONE[event.dayEffect]} className="shrink-0">
                    {t(`calendar.dayEffect.${event.dayEffect}`)}
                  </Badge>
                  {event.isHalfDay && (
                    <Badge variant="outline" className="shrink-0">
                      {t('calendar.halfDay')}
                    </Badge>
                  )}
                  {can('calendar', 'update') && (
                    <Button size="icon" variant="ghost" onClick={() => dialogs.openEdit(event)} aria-label={t('common.edit')}>
                      <Pencil className="size-4" />
                    </Button>
                  )}
                  {can('calendar', 'delete') && (
                    <Button size="icon" variant="ghost" onClick={() => dialogs.askDelete(event)} aria-label={t('common.delete')}>
                      <Trash2 className="size-4 text-danger" />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <FormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        title={dialogs.isEditing ? t('calendar.editEvent') : t('calendar.addEvent')}
        onSubmit={submit}
        isSubmitting={create.isPending || update.isPending}
        size="lg"
      >
        <Form {...form}>
          <FieldSection>
            <TextField control={form.control} name="titleLo" label={t('calendar.titleLo')} required />
            <TextField control={form.control} name="titleEn" label={t('calendar.titleEn')} />
            <SelectField
              control={form.control}
              name="type"
              label={t('calendar.eventType')}
              options={typeOptions}
              required
            />
            <SelectField
              control={form.control}
              name="dayEffect"
              label={t('calendar.dayEffectLabel')}
              description={t('calendar.dayEffectHint')}
              options={effectOptions}
              required
            />
            <DateField control={form.control} name="startDate" label={t('schoolYear.startDate')} required />
            <DateField
              control={form.control}
              name="endDate"
              label={t('schoolYear.endDate')}
              description={t('calendar.endDateHint')}
              required
            />
            <CheckboxField
              control={form.control}
              name="isHalfDay"
              label={t('calendar.halfDay')}
              description={t('calendar.halfDayHint')}
            />
            <TextareaField
              control={form.control}
              name="description"
              label={t('common.description')}
              className="sm:col-span-2"
            />
          </FieldSection>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('calendar.deleteEvent')}
        description={dialogs.deleteTarget?.titleLo}
        confirmLabel={t('common.delete')}
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() =>
          dialogs.deleteTarget &&
          remove.mutate(dialogs.deleteTarget.id, { onSuccess: () => dialogs.cancelDelete() })
        }
      />
    </div>
  );
}
