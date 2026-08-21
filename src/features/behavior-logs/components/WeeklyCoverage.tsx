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
import { cn, formatDate, localizedName } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
  useWeeklyCoverage,
  type WeeklyCoverage as WeeklyCoverageReport,
  type WeeklyCoverageRow,
  type WeeklyCoverageSummary,
} from '../api';
import { classLabel, subjectLabel } from './MyWeekReminder';

const MS_PER_DAY = 86_400_000;

/** The Monday of the week containing `date`, as `yyyy-MM-dd`. */
function mondayOf(date: Date): string {
  const utc = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const offset = (new Date(utc).getUTCDay() + 6) % 7;
  return new Date(utc - offset * MS_PER_DAY).toISOString().slice(0, 10);
}

function shiftWeeks(weekStartDate: string, weeks: number): string {
  return new Date(new Date(weekStartDate).getTime() + weeks * 7 * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/**
 * Which class and which teacher wrote nothing this week.
 *
 * The other three tabs all read rows that exist, so none of them can show the
 * class nobody wrote about — and that is the one thing oversight is looking for.
 * This tab inverts the read: the timetable says what was taught, the register is
 * matched into it, and what has no match is the answer.
 *
 * A lesson later in the same week is not a gap yet, and is kept out of the
 * expected count rather than shown as a shortfall — a report that flags the whole
 * school every Monday morning is one nobody opens on Tuesday.
 *
 * The table is printable, which is how it leaves the app: a week's gaps get
 * walked into a staff meeting or filed, and the browser's own print-to-PDF is a
 * document the office already knows how to handle — no second rendering of the
 * same table on the server to keep in step with this one. What is printed is
 * exactly what is on screen, so the printed block carries its own heading with
 * the week, the filter and the counts, all of which live outside it on screen.
 */
export function WeeklyCoverage() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();

  const thisWeek = mondayOf(new Date());
  const [weekOf, setWeekOf] = useState<string>(thisWeek);
  const [classroomId, setClassroomId] = useState<string | undefined>();
  // Defaults to the gaps: with a full timetable the complete list runs to
  // hundreds of rows, and the summary above it already reports the whole week.
  const [outstandingOnly, setOutstandingOnly] = useState(true);

  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);
  // Same query the picker reads, so this is the cache rather than a second
  // request; the printed heading has to name the class it was filtered to.
  const classrooms = useClassroomOptions('', activeYear.data?.id);
  const classroomFilterLabel = classroomId
    ? classrooms.data?.find((option) => option.value === classroomId)?.label
    : undefined;

  const coverage = useWeeklyCoverage({ weekOf, classroomId, outstandingOnly });
  const data = coverage.data;
  const rows = data?.rows ?? [];

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-5">
          <div className="space-y-1.5">
            <Label>{t('behaviorLog.week')}</Label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label={t('behaviorLog.previousWeek')}
                onClick={() => setWeekOf(shiftWeeks(weekOf, -1))}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-44 text-center text-sm tabular-nums">
                {data
                  ? t('behaviorLog.weekRange', {
                      from: formatDate(data.weekStartDate),
                      to: formatDate(data.weekEndDate),
                    })
                  : '—'}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label={t('behaviorLog.nextWeek')}
                // Nothing to look at ahead of the current week: no lesson has
                // been taught yet, so every row would come back "not due".
                disabled={weekOf >= thisWeek}
                onClick={() => setWeekOf(shiftWeeks(weekOf, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>

          <div className="w-full space-y-1.5 sm:w-64">
            <Label htmlFor="coverage-classroom">{t('behaviorLog.classroom')}</Label>
            <EntitySelect
              id="coverage-classroom"
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useClassroomsForYear}
              placeholder={t('behaviorLog.everyClassroom')}
            />
          </div>

          <div className="flex items-center gap-2 pb-1.5">
            <Switch
              id="coverage-outstanding"
              checked={outstandingOnly}
              onCheckedChange={setOutstandingOnly}
            />
            <Label htmlFor="coverage-outstanding" className="cursor-pointer">
              {t('behaviorLog.onlyMissing')}
            </Label>
          </div>

          <Button
            variant="outline"
            className="ms-auto"
            onClick={() => window.print()}
            disabled={rows.length === 0}
          >
            <Printer />
            {t('behaviorLog.print')}
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
              title={t(outstandingOnly ? 'behaviorLog.noGaps' : 'behaviorLog.noLessonsThisWeek')}
              description={t(
                outstandingOnly ? 'behaviorLog.noGapsHint' : 'behaviorLog.noLessonsThisWeekHint',
              )}
            />
          ) : (
            // `Table` brings its own scroller, which the print stylesheet turns
            // back into a plain block so the last columns wrap instead of being
            // clipped off the page.
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('behaviorLog.classroom')}</TableHead>
                  <TableHead>{t('behaviorLog.teacher')}</TableHead>
                  <TableHead>{t('behaviorLog.subject')}</TableHead>
                  <TableHead className="w-28">{t('behaviorLog.lessons')}</TableHead>
                  <TableHead className="w-24">{t('behaviorLog.entryCount')}</TableHead>
                  <TableHead className="w-32">{t('behaviorLog.lastEntry')}</TableHead>
                  <TableHead className="w-32">{t('behaviorLog.coverageStatus')}</TableHead>
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
                      <span className="text-muted-foreground">/{row.lessonsThisWeek}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">{row.rows}</TableCell>
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

      <p className="text-xs text-muted-foreground">{t('behaviorLog.coverageNote')}</p>
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
  outstandingOnly,
  classroomFilterLabel,
}: {
  coverage: WeeklyCoverageReport;
  outstandingOnly: boolean;
  classroomFilterLabel: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const { summary } = coverage;

  const scope = [
    t(outstandingOnly ? 'behaviorLog.coverageScopeMissing' : 'behaviorLog.coverageScopeAll'),
    classroomFilterLabel ?? t('behaviorLog.everyClassroom'),
  ].join(' · ');

  return (
    <header className="hidden space-y-1 text-center print:block">
      <h2 className="text-lg font-semibold">{t('behaviorLog.coverageReportTitle')}</h2>
      <p className="text-sm">
        {t('behaviorLog.weekRange', {
          from: formatDate(coverage.weekStartDate),
          to: formatDate(coverage.weekEndDate),
        })}
        {coverage.semester && ` · ${localizedName(coverage.semester, i18n.language)}`}
        {` · ${t('behaviorLog.asOf', { date: formatDate(coverage.asOf) })}`}
      </p>
      <p className="text-sm">{scope}</p>
      <p className="text-sm">
        {t('behaviorLog.coverageSummaryLine', {
          recorded: summary.recorded,
          expected: summary.expected,
          rate: summary.coverageRate,
          missing: summary.missing,
          teachers: summary.teachersMissing,
          classrooms: summary.classroomsMissing,
        })}
      </p>
      <p className="text-xs text-muted-foreground">
        {t('behaviorLog.printedOn', { date: formatDate(new Date()) })}
      </p>
    </header>
  );
}

/** The four numbers the academic office acts on, ahead of the list itself. */
function SummaryTiles({ summary, asOf }: { summary: WeeklyCoverageSummary; asOf: string }) {
  const { t } = useTranslation();

  const tiles = [
    {
      icon: CalendarCheck,
      label: t('behaviorLog.coverageRate'),
      value: `${summary.recorded}/${summary.expected}`,
      hint: `${summary.coverageRate}%`,
      tone: summary.coverageRate >= 80 ? 'text-success' : 'text-warning',
    },
    {
      icon: AlertTriangle,
      label: t('behaviorLog.missingLessons'),
      value: String(summary.missing),
      hint: t('behaviorLog.asOf', { date: formatDate(asOf) }),
      tone: summary.missing > 0 ? 'text-danger' : 'text-muted-foreground',
    },
    {
      icon: Users,
      label: t('behaviorLog.teachersBehind'),
      value: String(summary.teachersMissing),
      hint: undefined,
      tone: summary.teachersMissing > 0 ? 'text-warning' : 'text-muted-foreground',
    },
    {
      icon: DoorOpen,
      label: t('behaviorLog.classroomsBehind'),
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

function StatusCell({ status }: { status: WeeklyCoverageRow['status'] }) {
  const { t } = useTranslation();

  if (status === 'recorded') {
    return <Badge variant="success">{t('behaviorLog.statusRecorded')}</Badge>;
  }
  if (status === 'missing') {
    return <Badge variant="danger">{t('behaviorLog.statusMissing')}</Badge>;
  }
  return <Badge variant="secondary">{t('behaviorLog.statusNotYet')}</Badge>;
}
