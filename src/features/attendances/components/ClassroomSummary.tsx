import { BarChart3, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCan } from '@/features/auth/hooks';
import { classrooms, useClassroomOptions } from '@/features/classrooms/api';
import { useClassRoster } from '@/features/enrollments/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { semesters, useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { useSubjectOptions } from '@/features/subjects/api';
import { monthBounds, monthsOf } from '@/lib/term-months';
import {
  cn,
  formatDate,
  fullName,
  isOnCurrentRoll,
  localizedName,
  nickname,
  refId,
  refObject,
} from '@/lib/utils';
import type { Attendance, Student, Subject, Teacher, User } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { StatusBadge } from '@/components/common/StatusBadge';
import { StudentName } from '@/components/common/StudentName';
import {
  useClassroomAttendanceSummary,
  useSemesterAbsences,
  useStudentAbsences,
  type AttendanceSummary,
  type AttendanceSummaryScope,
} from '../api';

/** Below this, an attendance rate is worth flagging rather than just reporting. */
const AT_RISK_RATE = 80;

/** One row: a student from the roster, with whatever the summary knows about them. */
interface SummaryRow extends AttendanceSummary {
  studentCode: string;
  studentName: string;
  studentNickname: string | null;
  rollNumber?: number | null;
  /** Only on the school-wide list, where the room is what the reader is after. */
  classroomId?: string | null;
  classroomName?: string | null;
}

/**
 * The office's own lines: at 15 days of ວັນຂາດ a warning goes home, at 30 the
 * student's place is reviewed. Offered as choices rather than a free number so
 * every reader asks the same question.
 */
const ABSENCE_THRESHOLDS = [15, 30] as const;

/** The `Select` cannot carry an empty value, so "no threshold" is spelled out. */
const NO_THRESHOLD = 'none';

const EMPTY_COUNTS = {
  present: 0,
  absent: 0,
  late: 0,
  excused: 0,
  sick: 0,
  totalRecorded: 0,
  lateAsAbsent: 0,
  lateRemainder: 0,
  absentUnexcused: 0,
  absentExcused: 0,
  absentTotal: 0,
  latesPerAbsence: 0,
  attendanceRate: 0,
};

/** What the API applies when the office has not set `attendance.latesPerAbsence`. */
const DEFAULT_LATES_PER_ABSENCE = 3;

/** The `Select` cannot carry an empty value, so "the whole term" is spelled out. */
const WHOLE_TERM = 'all';

/**
 * Absence counts for a whole class over one semester.
 *
 * The summary endpoint aggregates by student id and returns nothing else, and it
 * only returns students who have at least one record — so the roster is what the
 * rows are built from. That way a student with a perfect record and a student
 * nobody has ever marked are both visible, and tell apart.
 */
export function ClassroomSummary() {
  const { t } = useTranslation();
  const can = useCan();
  const activeYear = useActiveSchoolYear();
  const activeSemester = useActiveSemester();

  const [classroomId, setClassroomId] = useState<string | undefined>();
  const [semesterId, setSemesterId] = useState<string | undefined>();
  const effectiveSemesterId = semesterId ?? activeSemester.data?.id;

  // What narrows the counts below the whole term. A month and a date range are
  // two ways of saying the same thing, so picking one clears the other rather
  // than intersecting silently into an empty window.
  const [monthKey, setMonthKey] = useState<string | undefined>();
  const [from, setFrom] = useState<string | undefined>();
  const [to, setTo] = useState<string | undefined>();
  const [subjectId, setSubjectId] = useState<string | undefined>();
  // ວັນຂາດ at or above which a student is listed. With a room picked it thins
  // the class table; without one it turns the tab into the school-wide list.
  const [minAbsentDays, setMinAbsentDays] = useState<number | undefined>();
  const schoolWide = !classroomId && minAbsentDays !== undefined;
  const pickMonth = (key: string) => {
    setMonthKey(key === WHOLE_TERM ? undefined : key);
    setFrom(undefined);
    setTo(undefined);
  };
  const pickRange = (which: 'from' | 'to', value: string) => {
    (which === 'from' ? setFrom : setTo)(value || undefined);
    setMonthKey(undefined);
  };

  const semester = semesters.useDetail(effectiveSemesterId);
  const termMonths = useMemo(
    () => monthsOf(semester.data?.startDate, semester.data?.endDate),
    [semester.data?.startDate, semester.data?.endDate],
  );
  // A month picked under one term means nothing under the next; it is dropped
  // rather than sent, since the API would count a different year's month.
  const termMonth = termMonths.find((candidate) => candidate.key === monthKey);

  // Attendance is taken against the timetable, so the subjects on offer are
  // the class's `taught` ones — the four ສາຍວິຊາ from ມ.4 up, not the eight
  // that are marked.
  const classroom = classrooms.useDetail(classroomId);
  const gradeLevelId = refId(classroom.data?.gradeLevelId) ?? undefined;
  const useSubjectsForClass = (search: string) => useSubjectOptions(search, gradeLevelId, 'taught');

  const summaryScope = useMemo<AttendanceSummaryScope>(
    () => ({ month: termMonth?.month, from, to, subjectId }),
    [termMonth?.month, from, to, subjectId],
  );
  // The log has no `month`, so the month is handed to it as its own two bounds.
  const listScope = useMemo(
    () => ({
      from: termMonth ? monthBounds(termMonth).from : from,
      to: termMonth ? monthBounds(termMonth).to : to,
      subjectId,
    }),
    [termMonth, from, to, subjectId],
  );
  // Which students' rows are opened up to the lessons behind their counts.
  // Keyed by student, so switching semester keeps the same children open — the
  // reader comparing terms is looking at the same names.
  const [openStudentIds, setOpenStudentIds] = useState<ReadonlySet<string>>(new Set());
  const toggleStudent = (studentId: string) =>
    setOpenStudentIds((open) => {
      const next = new Set(open);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });

  const semesterOptions = useSemesterOptions('', activeYear.data?.id);
  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);

  const summary = useClassroomAttendanceSummary(classroomId, effectiveSemesterId, summaryScope);
  // Names live on the enrollment, so a role without `enrollments:read` gets the
  // counts without them rather than a 403 it cannot act on.
  const canReadRoster = can('enrollments');
  const roster = useClassRoster(canReadRoster ? classroomId : undefined);
  // The school-wide list names its students itself, so it needs no roster.
  const schoolAbsences = useSemesterAbsences(
    effectiveSemesterId,
    { ...summaryScope, minAbsentDays: minAbsentDays ?? 0 },
    schoolWide,
  );

  const rows = useMemo<SummaryRow[]>(() => {
    if (schoolWide) {
      return (schoolAbsences.data ?? []).map((row) => ({
        ...row,
        studentCode: row.studentCode ?? '—',
        studentName: row.studentNameLo ?? '—',
        rollNumber: null,
      }));
    }

    const byStudent = new Map((summary.data ?? []).map((row) => [row.studentId, row]));
    // With a threshold, only the students at or past it are shown — the same
    // line the school-wide list draws, kept here so the room can be read alone.
    const overLine = (row: SummaryRow) =>
      minAbsentDays === undefined || row.absentTotal >= minAbsentDays;

    if (!canReadRoster) {
      return (summary.data ?? [])
        .map((row) => ({
          ...row,
          studentCode: '—',
          studentName: '—',
          studentNickname: null,
          rollNumber: null,
        }))
        .filter(overLine);
    }

    // The roster is every open enrollment in the room, which is not the same as
    // every child still being taught there: the office marks a student as
    // transferred or dropped without closing their placement. This table is read
    // as the class, so it follows the roll rather than the placements.
    return (roster.data ?? [])
      .filter((enrollment) => isOnCurrentRoll(enrollment.studentId))
      .map((enrollment) => {
        const studentId = refId(enrollment.studentId) ?? '';
        return {
          // A student with no records is absent from the aggregation, not absent
          // from class — they get zeroes rather than being dropped from the table.
          ...(byStudent.get(studentId) ?? EMPTY_COUNTS),
          studentId,
          studentCode: enrollment.studentCode,
          studentName: enrollment.studentNameLo,
          // The roster row snapshots the register name; the nickname comes off the
          // joined student, so it is current even when it was typed in after
          // placement. Read in Lao regardless of the interface language, to match
          // the `studentNameLo` it sits beside — and the register sheets, which the
          // API resolves the same way.
          studentNickname: nickname(refObject<Student>(enrollment.studentId), 'lo'),
          rollNumber: enrollment.rollNumber,
        };
      })
      .filter(overLine);
  }, [summary.data, roster.data, canReadRoster, schoolWide, schoolAbsences.data, minAbsentDays]);

  const isLoading = schoolWide
    ? schoolAbsences.isLoading
    : summary.isLoading || (canReadRoster && roster.isLoading);
  const error = schoolWide ? schoolAbsences.error : (summary.error ?? roster.error);
  const refetch = schoolWide ? schoolAbsences.refetch : summary.refetch;

  return (
    <div className="space-y-3">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="summary-classroom">{t('attendance.classroom')}</Label>
            <EntitySelect
              id="summary-classroom"
              value={classroomId ?? null}
              onChange={setClassroomId}
              useOptions={useClassroomsForYear}
              placeholder={t('attendance.selectClassroom')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>{t('attendance.semester')}</Label>
            <Select value={effectiveSemesterId ?? ''} onValueChange={setSemesterId}>
              <SelectTrigger>
                <SelectValue placeholder={t('attendance.semester')} />
              </SelectTrigger>
              <SelectContent>
                {(semesterOptions.data ?? []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="summary-month">{t('attendance.month')}</Label>
              <Select value={termMonth?.key ?? WHOLE_TERM} onValueChange={pickMonth}>
                <SelectTrigger id="summary-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={WHOLE_TERM}>{t('attendance.wholeTerm')}</SelectItem>
                  {termMonths.map((candidate) => (
                    <SelectItem key={candidate.key} value={candidate.key}>
                      {t(`month.${candidate.month}`)} {candidate.year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="summary-from">{t('attendance.from')}</Label>
              <Input
                id="summary-from"
                type="date"
                value={from ?? ''}
                max={to}
                onChange={(event) => pickRange('from', event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="summary-to">{t('attendance.to')}</Label>
              <Input
                id="summary-to"
                type="date"
                value={to ?? ''}
                min={from}
                onChange={(event) => pickRange('to', event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="summary-subject">{t('attendance.subject')}</Label>
              <EntitySelect
                id="summary-subject"
                value={subjectId ?? null}
                onChange={setSubjectId}
                useOptions={useSubjectsForClass}
                disabled={!classroomId}
                placeholder={
                  classroomId ? t('attendance.allSubjects') : t('attendance.pickClassFirst')
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="summary-threshold">{t('attendance.absentAtLeast')}</Label>
              <Select
                value={minAbsentDays === undefined ? NO_THRESHOLD : String(minAbsentDays)}
                onValueChange={(value) =>
                  setMinAbsentDays(value === NO_THRESHOLD ? undefined : Number(value))
                }
              >
                <SelectTrigger id="summary-threshold">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_THRESHOLD}>{t('attendance.everyone')}</SelectItem>
                  {ABSENCE_THRESHOLDS.map((days) => (
                    <SelectItem key={days} value={String(days)}>
                      {t('attendance.absentDaysOption', { count: days })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {!effectiveSemesterId || (!classroomId && !schoolWide) ? (
            <EmptyState icon={BarChart3} title={t('attendance.summaryHint')} />
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={refetch} compact />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title={
                minAbsentDays === undefined
                  ? t('attendance.emptySummary')
                  : t('attendance.nobodyOverLine', { count: minAbsentDays })
              }
            />
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {/* Across the school the room is what the reader is after;
                        inside one, the roll number is. */}
                    {schoolWide ? (
                      <TableHead className="w-28">{t('attendance.classroom')}</TableHead>
                    ) : (
                      <TableHead className="w-14">{t('attendance.rollNumber')}</TableHead>
                    )}
                    <TableHead>{t('attendance.student')}</TableHead>
                    <TableHead className="text-center">{t('attendanceStatus.present')}</TableHead>
                    <TableHead className="text-center">{t('attendanceStatus.late')}</TableHead>
                    {/* ວັນຂາດ as the office reads them — the API's figures, not
                        the raw statuses: excused and sick are one column, and
                        three lates are a day absent without a reason. */}
                    <TableHead className="text-center">{t('attendance.absentUnexcused')}</TableHead>
                    <TableHead className="hidden text-center md:table-cell">
                      {t('attendance.absentExcused')}
                    </TableHead>
                    <TableHead className="text-center">{t('attendance.absentTotal')}</TableHead>
                    <TableHead className="w-40">{t('attendance.rate')}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <SummaryRowView
                      key={row.studentId}
                      row={row}
                      semesterId={effectiveSemesterId}
                      classroomId={classroomId}
                      scope={listScope}
                      open={openStudentIds.has(row.studentId)}
                      onToggle={() => toggleStudent(row.studentId)}
                      onPickClassroom={schoolWide ? setClassroomId : undefined}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* The rule is the API's setting, read off the rows rather than copied here. */}
      <p className="text-xs text-muted-foreground">
        {t('attendance.rateNote', {
          per: summary.data?.[0]?.latesPerAbsence ?? DEFAULT_LATES_PER_ABSENCE,
        })}
      </p>
    </div>
  );
}

/** How many table columns a row spans, for the detail row beneath it. */
const SUMMARY_COLUMNS = 9;

/** The window and subject a row's counts were taken over, as the log takes them. */
type AbsenceScope = Pick<AttendanceSummaryScope, 'from' | 'to' | 'subjectId'>;

/**
 * One student's counts, and — opened up — the lessons behind them.
 *
 * The counts answer "how often"; the office's next question is always "which
 * subject, which day, whose lesson", and that used to mean leaving for the
 * History tab and filtering it by hand. Only a row with something other than
 * `present` on it opens: a clean row has nothing to show.
 */
function SummaryRowView({
  row,
  semesterId,
  classroomId,
  scope,
  open,
  onToggle,
  onPickClassroom,
}: {
  row: SummaryRow;
  semesterId: string | undefined;
  classroomId: string | undefined;
  scope: AbsenceScope;
  open: boolean;
  onToggle: () => void;
  /** On the school-wide list: the room cell narrows the tab to that room. */
  onPickClassroom?: (classroomId: string) => void;
}) {
  const { t } = useTranslation();
  const hasDetail = row.absent + row.late + row.excused + row.sick > 0;

  return (
    <>
      <TableRow
        className={cn(hasDetail && 'cursor-pointer')}
        onClick={hasDetail ? onToggle : undefined}
      >
        {onPickClassroom ? (
          <TableCell>
            {row.classroomId && row.classroomName ? (
              <Button
                type="button"
                variant="link"
                className="h-auto p-0 font-medium"
                onClick={(event) => {
                  event.stopPropagation();
                  onPickClassroom(row.classroomId!);
                }}
              >
                {row.classroomName}
              </Button>
            ) : (
              '—'
            )}
          </TableCell>
        ) : (
          <TableCell className="tabular-nums text-muted-foreground">
            {row.rollNumber ?? '—'}
          </TableCell>
        )}
        <TableCell>
          <Link
            to={`/students/${row.studentId}`}
            className="font-medium hover:underline"
            // The name goes to the student; the rest of the row opens the detail.
            onClick={(event) => event.stopPropagation()}
          >
            <StudentName name={row.studentName} nickname={row.studentNickname} />
          </Link>
          <p className="text-xs text-muted-foreground">{row.studentCode}</p>
        </TableCell>
        <TableCell className="text-center tabular-nums">{row.present}</TableCell>
        <TableCell className="text-center tabular-nums">
          {row.late}
          {/* The lates that have become absences are still lates on the roll;
              the second line says how many are left over as such. */}
          {row.lateAsAbsent > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('attendance.lateRemainderNote', { count: row.lateRemainder })}
            </p>
          )}
        </TableCell>
        <TableCell
          className={cn(
            'text-center tabular-nums',
            row.absentUnexcused > 0 && 'font-medium text-danger',
          )}
        >
          {row.absentUnexcused}
          {/* Which of those days are lates, so the reader knows where an
              absence they never marked came from. */}
          {row.lateAsAbsent > 0 && (
            <p className="text-xs font-normal text-muted-foreground">
              {t('attendance.fromLatesNote', { count: row.lateAsAbsent })}
            </p>
          )}
        </TableCell>
        <TableCell className="hidden text-center tabular-nums md:table-cell">
          {row.absentExcused}
        </TableCell>
        <TableCell className={cn('text-center tabular-nums', row.absentTotal > 0 && 'font-medium')}>
          {row.absentTotal}
        </TableCell>
        <TableCell>
          {row.totalRecorded === 0 ? (
            <span className="text-xs text-muted-foreground">{t('attendance.notRecorded')}</span>
          ) : (
            <div className="flex items-center gap-2">
              <Progress value={row.attendanceRate} className="h-1.5 flex-1" />
              <span
                className={cn(
                  'w-14 text-end text-xs tabular-nums',
                  row.attendanceRate < AT_RISK_RATE
                    ? 'font-medium text-danger'
                    : 'text-muted-foreground',
                )}
              >
                {row.attendanceRate.toFixed(1)}%
              </span>
            </div>
          )}
        </TableCell>
        <TableCell className="text-end">
          {hasDetail && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              aria-expanded={open}
              aria-label={open ? t('attendance.hideAbsences') : t('attendance.showAbsences')}
              onClick={(event) => {
                event.stopPropagation();
                onToggle();
              }}
            >
              <ChevronDown
                className={cn(
                  'size-4 text-muted-foreground transition-transform',
                  open && 'rotate-180',
                )}
              />
            </Button>
          )}
        </TableCell>
      </TableRow>

      {open && hasDetail && (
        <TableRow className="bg-muted/40 hover:bg-muted/40">
          <TableCell colSpan={SUMMARY_COLUMNS} className="py-3">
            <StudentAbsences
              studentId={row.studentId}
              semesterId={semesterId}
              classroomId={classroomId}
              scope={scope}
              summary={row}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/**
 * The lessons one student did not attend — subject, day, whose lesson, and why.
 *
 * Read from the attendance log rather than the summary, which only carries
 * counts. Newest first, as the log is; the teacher is the timetabled one, with
 * whoever filed the roll call underneath when that was someone else — the same
 * two lines the History tab shows, for the same reason.
 */
function StudentAbsences({
  studentId,
  semesterId,
  classroomId,
  scope,
  summary,
}: {
  studentId: string;
  semesterId: string | undefined;
  classroomId: string | undefined;
  scope: AbsenceScope;
  /** The row's own counts, for the note on how its lates were read. */
  summary: AttendanceSummary;
}) {
  const { t, i18n } = useTranslation();
  const absences = useStudentAbsences(studentId, semesterId, classroomId, scope, true);

  if (absences.isLoading) {
    return (
      <div className="space-y-1.5">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (absences.error) {
    return <ErrorState error={absences.error} onRetry={absences.refetch} compact />;
  }

  const records = absences.data?.data ?? [];
  const total = absences.data?.meta.total ?? records.length;

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium">{t('attendance.absencesTitle')}</p>
      {/* The one absence the list below cannot show a date for: the day made
          of late arrivals. Named here so the count above it is explained. */}
      {summary.lateAsAbsent > 0 && (
        <p className="text-xs text-warning">
          {t('attendance.lateRuleNote', {
            late: summary.late,
            days: summary.lateAsAbsent,
            per: summary.latesPerAbsence,
          })}
        </p>
      )}
      {records.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('attendance.absencesEmpty')}</p>
      ) : (
        <ul className="divide-y divide-border/60 text-sm">
          {records.map((record) => (
            <AbsenceLine key={record.id} record={record} language={i18n.language} />
          ))}
        </ul>
      )}
      {total > records.length && (
        <p className="text-xs text-muted-foreground">
          {t('attendance.absencesMore', { shown: records.length, total })}
        </p>
      )}
    </div>
  );
}

function AbsenceLine({ record, language }: { record: Attendance; language: string }) {
  const { t } = useTranslation();
  const subject = refObject<Subject>(record.subjectId);
  const teacher = refObject<Teacher>(record.teacherId);
  const recordedBy = refObject<User>(record.recordedBy);
  const filedByOther = recordedBy && recordedBy.personId !== refId(record.teacherId);

  return (
    <li className="grid grid-cols-[7rem_1fr_auto] items-start gap-x-3 gap-y-0.5 py-1.5 md:grid-cols-[7rem_1fr_1fr_auto_1fr]">
      <div className="leading-tight">
        <p className="tabular-nums">{formatDate(record.date)}</p>
        <p className="text-xs text-muted-foreground">
          {record.period === 0
            ? t('attendance.wholeDay')
            : t('attendance.periodN', { number: record.period })}
        </p>
      </div>
      <div className="leading-tight">
        <p>{subject ? localizedName(subject, language) : '—'}</p>
        {/* On a narrow screen the teacher drops under the subject rather than off the row. */}
        <p className="text-xs text-muted-foreground md:hidden">
          {teacher ? fullName(teacher, language) : '—'}
        </p>
      </div>
      <div className="hidden leading-tight md:block">
        <p>{teacher ? fullName(teacher, language) : '—'}</p>
        {filedByOther && (
          <p className="text-xs text-muted-foreground">
            {t('attendance.recordedByName', { username: recordedBy.username })}
          </p>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <StatusBadge status={record.status} namespace="attendanceStatus" />
        {record.status === 'late' && record.minutesLate != null && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {t('attendance.minutesLateValue', { count: record.minutesLate })}
          </span>
        )}
      </div>
      <p className="col-span-full text-xs text-muted-foreground md:col-span-1">
        {record.reason || ''}
      </p>
    </li>
  );
}
