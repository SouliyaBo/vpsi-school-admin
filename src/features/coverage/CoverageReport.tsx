import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  CalendarCheck,
  ChevronLeft,
  ChevronRight,
  DoorOpen,
  Printer,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { weekdayKey } from '@/features/teaching-assignments/schedule';
import { cn, formatDate, localizedName, toDateInput } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { EntitySelect } from '@/components/common/EntitySelect';
import { ErrorState } from '@/components/common/ErrorState';
import {
  classLabel,
  subjectLabel,
  useCoverage,
  type CoverageKind,
  type CoverageRow,
  type CoverageScope,
  type CoverageSummary,
  type LessonCoverage,
} from './api';

/**
 * What differs between the two reports — which is only the wording.
 *
 * The behaviour register is owed once per window and the roll call once per lesson
 * day, but that rule lives on the server; here the difference is what the columns
 * are called and which set of days is worth a column. Held as data rather than as
 * branches through the render, so adding a third log is a row in this table.
 */
const VARIANTS = {
  behavior: {
    reportTitle: 'behaviorLog.coverageReportTitle',
    reportTitleDay: 'behaviorLog.coverageReportTitleDay',
    entryCount: 'behaviorLog.entryCount',
    lastEntry: 'behaviorLog.lastEntry',
    note: 'behaviorLog.coverageNote',
    noGaps: 'behaviorLog.noGaps',
    noGapsDay: 'behaviorLog.noGapsDay',
    noGapsHint: 'behaviorLog.noGapsHint',
    noGapsDayHint: 'behaviorLog.noGapsDayHint',
    // Which day a gap belongs to. The register is owed once for the window, so
    // the useful column is the days it was taught on; the roll call is owed per
    // day, so there the useful column is the days that were actually missed.
    daysHeader: 'behaviorLog.lessonDays',
    days: (row: CoverageRow) => row.lessonDates,
  },
  attendance: {
    reportTitle: 'attendance.coverageReportTitle',
    reportTitleDay: 'attendance.coverageReportTitleDay',
    entryCount: 'attendance.rollCallsTaken',
    lastEntry: 'attendance.lastMarked',
    note: 'attendance.coverageNote',
    noGaps: 'attendance.noGaps',
    noGapsDay: 'attendance.noGapsDay',
    noGapsHint: 'attendance.noGapsHint',
    noGapsDayHint: 'attendance.noGapsDayHint',
    daysHeader: 'attendance.daysNotMarked',
    days: (row: CoverageRow) => row.missingDates,
  },
} as const satisfies Record<CoverageKind, unknown>;

const MS_PER_DAY = 86_400_000;

/**
 * `yyyy-MM-dd` in, `yyyy-MM-dd` out.
 *
 * A bare date string parses as UTC midnight, so UTC arithmetic on it is exact —
 * whereas the same sums over a `Date` carrying a local time of day land on the
 * previous calendar day for anyone east of Greenwich in the small hours.
 */
function shiftDays(date: string, days: number): string {
  return new Date(new Date(date).getTime() + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** The Monday of the week containing `date`. */
function mondayOf(date: string): string {
  return shiftDays(date, -((new Date(date).getUTCDay() + 6) % 7));
}

/**
 * The window a report answered for, in its own terms.
 *
 * Read off the response rather than the selection: the two differ for as long as
 * a newly picked window is loading, and the numbers on screen belong to the one
 * that came back.
 */
function windowLabel(coverage: LessonCoverage, t: TFunction): string {
  return coverage.scope === 'day'
    ? // Named by weekday as well: a school week is read by day name, and the
      // date on its own repeats what the picker already shows.
      t('coverage.dayOf', {
        weekday: t(weekdayKey(new Date(coverage.startDate).getUTCDay())),
        date: formatDate(coverage.startDate),
      })
    : t('coverage.weekRange', {
        from: formatDate(coverage.startDate),
        to: formatDate(coverage.endDate),
      });
}

/** `ຈັນ 3` — enough to place a lesson inside a window already named above. */
function lessonDayLabel(date: string, t: TFunction): string {
  const parsed = new Date(date);
  return `${t(weekdayKey(parsed.getUTCDay()))} ${parsed.getUTCDate()}`;
}

/**
 * Which class and which teacher has nothing on file.
 *
 * One screen for two logs — the behaviour register and the roll call. Every other
 * tab on either page reads records that exist, so none of them can show the class
 * nobody wrote about; this one inverts the read, and the inversion is identical
 * for both: the timetable says what was taught, the log is matched into it, and
 * what has no match is the answer. Only the rule for "matched" differs, and that
 * lives on the server — a behaviour note is owed once per window, a roll call once
 * per lesson day. So `kind` picks an endpoint and a set of words, not a layout.
 *
 * A lesson later in the same window is not a gap yet, and is kept out of the
 * expected count rather than shown as a shortfall — a report that flags the whole
 * school every Monday morning is one nobody opens on Tuesday.
 *
 * The window is a week or a single day. The week is what these logs are chased
 * in, but it cannot answer "who wrote nothing on Monday": an entry made on
 * Tuesday counts towards the same week, so Monday's gap vanishes into it and the
 * counts read as a total of both days. A day asked as its own window keeps them
 * apart, and the report says which of the two it answered — the numbers for a day
 * and for its week are different numbers, and a screen that mislabels one as the
 * other is the one way this report can lie.
 *
 * The table is printable, which is how it leaves the app: a window's gaps get
 * walked into a staff meeting or filed, and the browser's own print-to-PDF is a
 * document the office already knows how to handle — no second rendering of the
 * same table on the server to keep in step with this one. What is printed is
 * exactly what is on screen, so the printed block carries its own heading with
 * the window, the filter and the counts, all of which live outside it on screen.
 */
export function CoverageReport({ kind }: { kind: CoverageKind }) {
  const { t, i18n } = useTranslation();
  const words = VARIANTS[kind];
  const activeYear = useActiveSchoolYear();

  const today = toDateInput(new Date());
  const [scope, setScope] = useState<CoverageScope>('week');
  // The day that was picked, never snapped: in week mode the server reads the
  // week around it, and moving the field back to that Monday would throw away
  // the day the next mode change is about to be read for.
  const [date, setDate] = useState<string>(today);
  const [classroomId, setClassroomId] = useState<string | undefined>();
  // Defaults to the gaps: with a full timetable the complete list runs to
  // hundreds of rows, and the summary above it already reports the whole window.
  const [outstandingOnly, setOutstandingOnly] = useState(true);

  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);
  // Same query the picker reads, so this is the cache rather than a second
  // request; the printed heading has to name the class it was filtered to.
  const classrooms = useClassroomOptions('', activeYear.data?.id);
  const classroomFilterLabel = classroomId
    ? classrooms.data?.find((option) => option.value === classroomId)?.label
    : undefined;

  const coverage = useCoverage(kind, {
    ...(scope === 'day' ? { date } : { weekOf: date }),
    classroomId,
    outstandingOnly,
  });
  const data = coverage.data;
  const rows = data?.rows ?? [];

  // Labelled from what came back, not from what is selected: while a new window
  // loads the previous one is still on screen, and it has to keep its own name.
  const shown = data?.scope ?? scope;
  const byDay = shown === 'day';

  // The summary always describes the whole window, never the narrowed list, so
  // it is the one thing that can tell "nothing was taught" from "nothing is owed".
  const nothingTimetabled = !!data && data.summary.expected === 0 && data.summary.notYet === 0;

  const step = scope === 'day' ? 1 : 7;
  // A window that has not started has no lesson taught in it, so every row of it
  // would come back "not due" — closed rather than answered.
  const atNow = scope === 'day' ? date >= today : mondayOf(date) >= mondayOf(today);

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-5">
          {/* One day or the week around it. Both are read from the same picked
              date, so switching does not make the office find its place again. */}
          <div className="space-y-1.5">
            <Label>{t('coverage.scope')}</Label>
            <div className="flex items-center gap-1">
              {(['day', 'week'] as const).map((option) => (
                <Button
                  key={option}
                  variant={scope === option ? 'default' : 'outline'}
                  aria-pressed={scope === option}
                  onClick={() => setScope(option)}
                >
                  {t(option === 'day' ? 'coverage.scopeDay' : 'coverage.scopeWeek')}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="coverage-date">
              {t(byDay ? 'coverage.date' : 'coverage.week')}
            </Label>
            <div className="flex flex-wrap items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label={t(
                  scope === 'day' ? 'coverage.previousDay' : 'coverage.previousWeek',
                )}
                onClick={() => setDate(shiftDays(date, -step))}
              >
                <ChevronLeft />
              </Button>
              {/* The arrows walk; the field jumps. A week two months back is a
                  question this report is actually asked — "who never wrote
                  anything in October" — and eight clicks to reach it is eight
                  chances to lose track of which window is on screen. */}
              <Input
                id="coverage-date"
                type="date"
                className="w-40"
                value={date}
                // Closed at today for the same reason the forward arrow is.
                max={today}
                title={t(byDay ? 'coverage.pickDateHintDay' : 'coverage.pickDateHintWeek')}
                onChange={(event) => {
                  // Empty while the field is being cleared or half-typed —
                  // keeping what is on screen beats asking for `Invalid Date`.
                  if (event.target.value) setDate(event.target.value);
                }}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label={t(scope === 'day' ? 'coverage.nextDay' : 'coverage.nextWeek')}
                disabled={atNow}
                onClick={() => setDate(shiftDays(date, step))}
              >
                <ChevronRight />
              </Button>
              {/* What came back, named — in week mode the field holds the day
                  that was picked and the report covers the week around it, so
                  the span it actually answered for has to be on screen. */}
              <span className="min-w-40 text-sm tabular-nums text-muted-foreground">
                {data ? windowLabel(data, t) : '—'}
              </span>
            </div>
          </div>

          <div className="w-full space-y-1.5 sm:w-64">
            <Label htmlFor="coverage-classroom">{t('coverage.classroom')}</Label>
            <EntitySelect
              id="coverage-classroom"
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useClassroomsForYear}
              placeholder={t('coverage.everyClassroom')}
            />
          </div>

          <div className="flex items-center gap-2 pb-1.5">
            <Switch
              id="coverage-outstanding"
              checked={outstandingOnly}
              onCheckedChange={setOutstandingOnly}
            />
            <Label htmlFor="coverage-outstanding" className="cursor-pointer">
              {t('coverage.onlyMissing')}
            </Label>
          </div>

          <Button
            variant="outline"
            className="ms-auto"
            onClick={() => window.print()}
            disabled={rows.length === 0}
          >
            <Printer />
            {t('coverage.print')}
          </Button>
        </CardContent>
      </Card>

      {data && <SummaryTiles summary={data.summary} asOf={data.asOf} />}

      {/* `print-sheet` is what the print stylesheet keeps — the filters, the tiles
          and the app frame are dropped around it. See index.css. */}
      <Card className="print-sheet">
        <CardContent className="space-y-3 pt-5">
          {data && (
            <PrintHeading
              coverage={data}
              words={words}
              outstandingOnly={outstandingOnly}
              classroomFilterLabel={classroomFilterLabel}
            />
          )}

          {coverage.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-10 w-full" />
              ))}
            </div>
          ) : coverage.error ? (
            <ErrorState error={coverage.error} onRetry={coverage.refetch} compact />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              // An empty table has two quite different meanings, and the summary
              // is what separates them: the timetable had nothing here at all, or
              // it had lessons and every one of them was written up. Read off the
              // summary rather than the filter, because a Sunday with the gaps
              // filter on is empty for the first reason and would otherwise be
              // congratulated for the second.
              title={t(
                nothingTimetabled
                  ? byDay
                    ? 'coverage.noLessonsThisDay'
                    : 'coverage.noLessonsThisWeek'
                  : byDay
                    ? words.noGapsDay
                    : words.noGaps,
              )}
              description={t(
                nothingTimetabled
                  ? 'coverage.noLessonsHint'
                  : byDay
                    ? words.noGapsDayHint
                    : words.noGapsHint,
              )}
            />
          ) : (
            // `Table` brings its own scroller, which the print stylesheet turns
            // back into a plain block so the last columns wrap instead of being
            // clipped off the page.
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('coverage.classroom')}</TableHead>
                  <TableHead>{t('coverage.teacher')}</TableHead>
                  <TableHead>{t('coverage.subject')}</TableHead>
                  <TableHead className="w-28">{t('coverage.lessons')}</TableHead>
                  {/* A day's report names its date once, above; repeating it on
                      every row would say nothing the heading has not. */}
                  {!byDay && <TableHead className="w-36">{t(words.daysHeader)}</TableHead>}
                  <TableHead className="w-24">{t(words.entryCount)}</TableHead>
                  <TableHead className="w-32">{t(words.lastEntry)}</TableHead>
                  <TableHead className="w-32">{t('coverage.coverageStatus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.teachingAssignmentId}>
                    <TableCell className="font-medium">{classLabel(row)}</TableCell>
                    <TableCell>
                      {row.teacherName}
                      <p className="text-xs text-muted-foreground">{row.teacherCode ?? '—'}</p>
                    </TableCell>
                    <TableCell>{subjectLabel(row, i18n.language)}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.lessonsElapsed}
                      <span className="text-muted-foreground">/{row.lessonsTimetabled}</span>
                    </TableCell>
                    {!byDay && (
                      <TableCell className="text-sm">
                        {words.days(row).map((date) => lessonDayLabel(date, t)).join(', ') || '—'}
                      </TableCell>
                    )}
                    <TableCell className="tabular-nums">{row.entries}</TableCell>
                    <TableCell className="tabular-nums">
                      {row.lastDate ? formatDate(row.lastDate) : '—'}
                    </TableCell>
                    <TableCell>
                      <StatusCell status={row.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t(words.note)}</p>
    </div>
  );
}

/**
 * The heading the printed document carries, and the screen does not.
 *
 * On screen the week, the filter and the counts are in the toolbar and the tiles
 * above; on paper those are gone, and a table of names with no statement of what
 * it is a table *of* is not a document anybody can act on a week later.
 */
function PrintHeading({
  coverage,
  words,
  outstandingOnly,
  classroomFilterLabel,
}: {
  coverage: LessonCoverage;
  words: (typeof VARIANTS)[CoverageKind];
  outstandingOnly: boolean;
  classroomFilterLabel: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const { summary } = coverage;

  const scope = [
    t(outstandingOnly ? 'coverage.coverageScopeMissing' : 'coverage.coverageScopeAll'),
    classroomFilterLabel ?? t('coverage.everyClassroom'),
  ].join(' · ');

  return (
    <header className="hidden space-y-1 text-center print:block">
      <h2 className="text-lg font-semibold">
        {t(coverage.scope === 'day' ? words.reportTitleDay : words.reportTitle)}
      </h2>
      <p className="text-sm">
        {windowLabel(coverage, t)}
        {coverage.semester && ` · ${localizedName(coverage.semester, i18n.language)}`}
        {` · ${t('coverage.asOf', { date: formatDate(coverage.asOf) })}`}
      </p>
      <p className="text-sm">{scope}</p>
      <p className="text-sm">
        {t('coverage.coverageSummaryLine', {
          recorded: summary.recorded,
          expected: summary.expected,
          rate: summary.coverageRate,
          missing: summary.missing,
          teachers: summary.teachersMissing,
          classrooms: summary.classroomsMissing,
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('coverage.printedOn', { date: formatDate(new Date()) })}
      </p>
    </header>
  );
}

/** The four numbers the academic office acts on, ahead of the list itself. */
function SummaryTiles({ summary, asOf }: { summary: CoverageSummary; asOf: string }) {
  const { t } = useTranslation();

  const tiles = [
    {
      icon: CalendarCheck,
      label: t('coverage.coverageRate'),
      value: `${summary.recorded}/${summary.expected}`,
      hint: `${summary.coverageRate}%`,
      tone: summary.coverageRate >= 80 ? 'text-success' : 'text-warning',
    },
    {
      icon: AlertTriangle,
      label: t('coverage.missingLessons'),
      value: String(summary.missing),
      hint: t('coverage.asOf', { date: formatDate(asOf) }),
      tone: summary.missing > 0 ? 'text-danger' : 'text-muted-foreground',
    },
    {
      icon: Users,
      label: t('coverage.teachersBehind'),
      value: String(summary.teachersMissing),
      hint: undefined,
      tone: summary.teachersMissing > 0 ? 'text-warning' : 'text-muted-foreground',
    },
    {
      icon: DoorOpen,
      label: t('coverage.classroomsBehind'),
      value: String(summary.classroomsMissing),
      hint: undefined,
      tone: summary.classroomsMissing > 0 ? 'text-warning' : 'text-muted-foreground',
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <CardContent className="flex items-center gap-3 pt-6">
            <tile.icon className={cn('size-5 shrink-0', tile.tone)} />
            <div className="min-w-0">
              <p className={cn('text-xl font-semibold tabular-nums', tile.tone)}>{tile.value}</p>
              <p className="truncate text-xs text-muted-foreground">
                {tile.label}
                {tile.hint && ` · ${tile.hint}`}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function StatusCell({ status }: { status: CoverageRow['status'] }) {
  const { t } = useTranslation();

  if (status === 'recorded') {
    return <Badge variant="success">{t('coverage.statusRecorded')}</Badge>;
  }
  if (status === 'missing') {
    return <Badge variant="danger">{t('coverage.statusMissing')}</Badge>;
  }
  return <Badge variant="secondary">{t('coverage.statusNotYet')}</Badge>;
}
