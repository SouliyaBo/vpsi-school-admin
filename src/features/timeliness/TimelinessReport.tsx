import { AlertTriangle, CalendarX, ChevronDown, Clock, Printer, UserX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveSemester } from '@/features/semesters/api';
import { cn, formatDate, formatDateTime, toDateInput } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import {
  lateness,
  useTimeliness,
  type RecordTimeliness,
  type TimelinessKind,
  type TimelinessRow,
} from './api';

/**
 * ຄວາມຕົງເວລາໃນການບັນທຶກ — who files the paperwork late.
 *
 * The report the school asked for after a few weeks of use, having noticed that
 * teachers were not filling the roll call or the behaviour register in on the day
 * and were coming back to it later. Coverage could not show it: a lesson written
 * up a fortnight late is, to that report, a lesson written up.
 *
 * What differs between the two logs is one fact and this screen states it rather
 * than hiding it: the roll call is owed for every lesson day, so a day with
 * nothing on file is a gap and has a column; the behaviour register is written
 * when there is something to note, so it has no such thing as a missing entry and
 * the column is not rendered at all. The API decides which, and says so in `rule`.
 *
 * Ordered worst first, by how much there is to talk about — late plus never
 * filed. A rate alone would put a teacher with one lesson and one late write-up
 * at the top of the school.
 */

const VARIANTS = {
  attendance: {
    title: 'timeliness.attendanceTitle',
    note: 'timeliness.attendanceNote',
    clear: 'timeliness.attendanceClear',
  },
  behavior: {
    title: 'timeliness.behaviorTitle',
    note: 'timeliness.behaviorNote',
    clear: 'timeliness.behaviorClear',
  },
} as const;

export function TimelinessReport({ kind }: { kind: TimelinessKind }) {
  const { t } = useTranslation();
  const variant = VARIANTS[kind];
  const semester = useActiveSemester();

  // Empty means "the term to date", which the API fills in — so the plain open
  // of the tab answers the question that is asked almost every time.
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const report = useTimeliness(kind, { from, to });

  if (report.isError) {
    return <ErrorState error={report.error} onRetry={() => report.refetch()} />;
  }

  return (
    <div className="space-y-4">
      <Card className="print:hidden">
        <CardContent className="flex flex-wrap items-end gap-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="timeliness-from">{t('timeliness.from')}</Label>
            <Input
              id="timeliness-from"
              type="date"
              value={from}
              min={semester.data ? toDateInput(semester.data.startDate) : undefined}
              onChange={(event) => setFrom(event.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="timeliness-to">{t('timeliness.to')}</Label>
            <Input
              id="timeliness-to"
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="w-40"
            />
          </div>
          {(from || to) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
            >
              {t('timeliness.wholeTerm')}
            </Button>
          )}
          <Button variant="outline" size="sm" className="ms-auto" onClick={() => window.print()}>
            <Printer className="size-4" />
            {t('coverage.print')}
          </Button>
        </CardContent>
      </Card>

      {report.isLoading || !report.data ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <header className="space-y-1 text-center">
            <h2 className="text-lg font-semibold">{t(variant.title)}</h2>
            <p className="text-sm text-muted-foreground">
              {formatDate(report.data.startDate)} – {formatDate(report.data.endDate)}
              {report.data.semester && ` · ${report.data.semester.nameLo}`}
            </p>
            <p className="text-xs text-muted-foreground">{t(variant.note)}</p>
          </header>

          <Summary report={report.data} />

          {report.data.rows.length === 0 ? (
            <EmptyState title={t('timeliness.noTimetable')} description={t('timeliness.noTimetableHint')} />
          ) : report.data.summary.late === 0 && (report.data.summary.missing ?? 0) === 0 ? (
            <EmptyState title={t(variant.clear)} description={t('timeliness.clearHint')} />
          ) : (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('timeliness.teacher')}</TableHead>
                      {report.data.rule === 'everyLessonDay' && (
                        <TableHead className="w-20 text-end">{t('timeliness.owed')}</TableHead>
                      )}
                      <TableHead className="w-20 text-end">{t('timeliness.onTime')}</TableHead>
                      <TableHead className="w-20 text-end">{t('timeliness.late')}</TableHead>
                      {report.data.rule === 'everyLessonDay' && (
                        <TableHead className="w-24 text-end">{t('timeliness.missing')}</TableHead>
                      )}
                      <TableHead className="w-40">{t('timeliness.lateRate')}</TableHead>
                      <TableHead className="w-32 text-end">{t('timeliness.worst')}</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.data.rows.map((row) => (
                      <TeacherRow
                        key={row.teacherId}
                        row={row}
                        showMissing={report.data.rule === 'everyLessonDay'}
                        open={expanded === row.teacherId}
                        onToggle={() =>
                          setExpanded((current) => (current === row.teacherId ? null : row.teacherId))
                        }
                      />
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The headline numbers.
 *
 * `notYetDue` and `unjudged` are on the page rather than folded into the totals,
 * because both are ways the report could otherwise flatter or condemn somebody
 * for something that is not their doing — a lesson taught this morning, and a
 * lesson the calendar has no next working day for.
 */
function Summary({ report }: { report: RecordTimeliness }) {
  const { t } = useTranslation();
  const { summary } = report;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        icon={<Clock className="size-4" />}
        label={t('timeliness.lateRate')}
        value={`${summary.lateRate}%`}
        hint={t('timeliness.ofJudged', { count: summary.onTime + summary.late })}
        tone={summary.lateRate >= 20 ? 'danger' : summary.lateRate > 0 ? 'warning' : 'success'}
      />
      <Stat
        icon={<AlertTriangle className="size-4" />}
        label={t('timeliness.late')}
        value={String(summary.late)}
        hint={
          summary.avgHoursLate > 0
            ? t('timeliness.avgLate', { value: lateness(summary.avgHoursLate, t) })
            : undefined
        }
        tone={summary.late > 0 ? 'warning' : 'success'}
      />
      {summary.missing !== null && (
        <Stat
          icon={<CalendarX className="size-4" />}
          label={t('timeliness.missing')}
          value={String(summary.missing)}
          hint={summary.owed !== null ? t('timeliness.ofOwed', { count: summary.owed }) : undefined}
          tone={summary.missing > 0 ? 'danger' : 'success'}
        />
      )}
      <Stat
        icon={<UserX className="size-4" />}
        label={t('timeliness.teachersLate')}
        value={String(summary.teachersLate)}
        hint={
          summary.notYetDue > 0 ? t('timeliness.notYetDue', { count: summary.notYetDue }) : undefined
        }
        tone={summary.teachersLate > 0 ? 'warning' : 'success'}
      />
      {/* Only ever non-zero when the calendar runs out — see the API. */}
      {summary.unjudged > 0 && (
        <p className="text-xs text-warning sm:col-span-2 lg:col-span-4">
          {t('timeliness.unjudged', { count: summary.unjudged })}
        </p>
      )}
      {report.judgedThrough && report.judgedThrough !== report.endDate && (
        <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">
          {t('timeliness.judgedThrough', { date: formatDate(report.judgedThrough) })}
        </p>
      )}
    </div>
  );
}

const TONES = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
} as const;

function Stat({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone: keyof typeof TONES;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 p-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className={cn('text-2xl font-semibold tabular-nums', TONES[tone])}>{value}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function TeacherRow({
  row,
  showMissing,
  open,
  onToggle,
}: {
  row: TimelinessRow;
  showMissing: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const hasDetail = row.lateLessons.length > 0 || row.missingDates.length > 0;

  return (
    <>
      <TableRow className={cn(hasDetail && 'cursor-pointer')} onClick={hasDetail ? onToggle : undefined}>
        <TableCell>
          <span className="font-medium">{row.teacherName}</span>
          {row.teacherCode && (
            <span className="ms-2 text-xs text-muted-foreground">{row.teacherCode}</span>
          )}
          {row.lastRecordedAt && (
            <span className="block text-xs text-muted-foreground">
              {t('timeliness.lastFiled', { at: formatDateTime(row.lastRecordedAt) })}
            </span>
          )}
        </TableCell>
        {showMissing && <TableCell className="text-end tabular-nums">{row.owed ?? '—'}</TableCell>}
        <TableCell className="text-end tabular-nums">{row.onTime}</TableCell>
        <TableCell className="text-end tabular-nums">
          {row.late > 0 ? <span className="font-medium text-warning">{row.late}</span> : row.late}
        </TableCell>
        {showMissing && (
          <TableCell className="text-end tabular-nums">
            {(row.missing ?? 0) > 0 ? (
              <span className="font-medium text-danger">{row.missing}</span>
            ) : (
              row.missing ?? '—'
            )}
          </TableCell>
        )}
        <TableCell>
          <span className="flex items-center gap-2">
            <Progress value={row.lateRate} className="h-1.5" />
            <span className="w-12 shrink-0 text-end text-xs tabular-nums">{row.lateRate}%</span>
          </span>
        </TableCell>
        <TableCell className="text-end text-xs tabular-nums">
          {lateness(row.worstHoursLate, t)}
        </TableCell>
        <TableCell>
          {hasDetail && (
            <ChevronDown
              className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
            />
          )}
        </TableCell>
      </TableRow>

      {/* The days themselves — what the conversation is actually held over. */}
      {open && hasDetail && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={showMissing ? 8 : 6} className="space-y-3 py-3">
            {row.lateLessons.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium">{t('timeliness.lateLessons')}</div>
                <ul className="space-y-0.5 text-xs">
                  {row.lateLessons.map((lesson) => (
                    <li key={`${lesson.date}-${lesson.classroomName}-${lesson.subjectNameLo}`}>
                      <span className="tabular-nums">{formatDate(lesson.date)}</span>
                      {/* The class name already carries its grade — `ມ.7/ຂ` — so
                          `gradeLevelCode` is not pasted in front of it. */}
                      <span className="ms-2">{lesson.classroomName}</span>
                      <span className="ms-2 text-muted-foreground">{lesson.subjectNameLo}</span>
                      <Badge variant="warning" className="ms-2">
                        {lateness(lesson.hoursLate, t)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {row.missingDates.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium">{t('timeliness.missingDays')}</div>
                <div className="flex flex-wrap gap-1.5">
                  {row.missingDates.map((date) => (
                    <Badge key={date} variant="danger" className="tabular-nums">
                      {formatDate(date)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
