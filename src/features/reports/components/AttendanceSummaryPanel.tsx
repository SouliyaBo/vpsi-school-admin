import { useQueries, useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { attendancesApi, type AttendanceAbsenceRow } from '@/features/attendances/api';
import { useCurrentUser, useSeesEveryStudent } from '@/features/auth/hooks';
import { classroomHeading, classroomsApi } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { semesters, useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { saveBlob } from '@/lib/save-blob';
import { monthsOf } from '@/lib/term-months';
import { notify } from '@/lib/toast';
import { formatDate, localizedName, refId, refObject } from '@/lib/utils';
import type { GradeLevel, Teacher } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import {
  attendanceTotals,
  classAttendanceRow,
  type AttendanceTotals,
  type ClassAttendanceRow,
} from '../lib/attendance-summary';

/** The office's own lines, as on the attendance page: a warning at 15, a review at 30. */
const THRESHOLDS = [15, 30] as const;

/** The `Select` cannot carry an empty value, so "the whole term" is spelled out. */
const WHOLE_TERM = 'all';

/**
 * ສະຫຼຸບການມາຮຽນທັງໂຮງຮຽນ — every class of the year on one sheet, for a term or
 * one month of it, and the students over the office's line.
 *
 * Built from the same per-class summary the attendance page reads, one request
 * per room, so a class's figures here are the figures its own tab shows. A
 * homeroom teacher gets their own room only.
 */
export function AttendanceSummaryPanel() {
  const { t, i18n } = useTranslation();
  const user = useCurrentUser();
  const seesEveryStudent = useSeesEveryStudent();
  const activeYear = useActiveSchoolYear();
  const activeSemester = useActiveSemester();
  const semesterOptions = useSemesterOptions('', activeYear.data?.id);

  const [pickedSemesterId, setSemesterId] = useState<string | undefined>();
  const semesterId = pickedSemesterId ?? activeSemester.data?.id;
  const semester = semesters.useDetail(semesterId);
  const termMonths = useMemo(
    () => monthsOf(semester.data?.startDate, semester.data?.endDate),
    [semester.data?.startDate, semester.data?.endDate],
  );
  const [monthKey, setMonthKey] = useState<string>(WHOLE_TERM);
  // A month picked under one term means nothing under the next.
  const termMonth = termMonths.find((candidate) => candidate.key === monthKey);
  const [threshold, setThreshold] = useState<number>(THRESHOLDS[0]);
  const [busy, setBusy] = useState(false);

  const yearId = activeYear.data?.id;
  const roomsQuery = useQuery({
    queryKey: ['classrooms', 'list', { schoolYearId: yearId, limit: 100 }],
    queryFn: () => classroomsApi.list({ schoolYearId: yearId, limit: 100, page: 1 }),
    enabled: Boolean(yearId),
    staleTime: 60_000,
  });
  const rooms = useMemo(
    () =>
      (roomsQuery.data?.data ?? [])
        .filter(
          (room) =>
            seesEveryStudent ||
            (user?.personId && refId<Teacher>(room.homeroomTeacherId) === user.personId),
        )
        .map((room) => ({
          id: room.id,
          label: classroomHeading({
            name: room.name,
            gradeLevelCode: refObject<GradeLevel>(room.gradeLevelId)?.code ?? null,
          }),
          headcount: room.currentCount,
        }))
        .sort((a, b) => a.label.localeCompare(b.label, 'lo', { numeric: true })),
    [roomsQuery.data, seesEveryStudent, user?.personId],
  );

  const scope = useMemo(() => ({ month: termMonth?.month }), [termMonth?.month]);
  const summaries = useQueries({
    queries: rooms.map((room) => ({
      queryKey: ['attendances', 'summary', 'classroom', room.id, semesterId, scope],
      queryFn: () => attendancesApi.classroomSummary(room.id, semesterId!, scope),
      enabled: Boolean(semesterId),
      retry: false,
    })),
  });

  // The office asks the school once; a homeroom teacher asks for their own room,
  // since the school-wide list would name every room's children.
  const absenceParams = { ...scope, minAbsentDays: threshold };
  const absenceRooms = seesEveryStudent ? [undefined] : rooms.map((room) => room.id);
  const absences = useQueries({
    queries: absenceRooms.map((classroomId) => ({
      queryKey: ['attendances', 'summary', 'semester-absences', semesterId, absenceParams, classroomId],
      queryFn: () =>
        attendancesApi.semesterAbsences(semesterId!, { ...absenceParams, classroomId }),
      enabled: Boolean(semesterId),
      retry: false,
    })),
  });

  const loading =
    roomsQuery.isLoading || summaries.some((query) => query.isLoading);
  const failed = roomsQuery.error ?? summaries.find((query) => query.error)?.error;

  const rows: ClassAttendanceRow[] = rooms.map((room, index) =>
    classAttendanceRow(room, summaries[index]?.data ?? [], threshold),
  );
  const totals = attendanceTotals(rows);
  const students: AttendanceAbsenceRow[] = absences.flatMap((query) => query.data ?? []);
  const absencesReady = absences.every((query) => query.isSuccess);

  const semesterName = semester.data ? localizedName(semester.data, i18n.language) : '';
  const windowLabel = termMonth ? t(`month.${termMonth.month}`) : t('attendance.wholeTerm');
  const title = t('report.attendance.title', { semester: semesterName, window: windowLabel });

  async function exportWorkbook() {
    setBusy(true);
    try {
      const { buildAttendanceSummaryWorkbook, attendanceSummaryFileName } = await import(
        '../lib/attendance-summary-workbook'
      );
      const blob = await buildAttendanceSummaryWorkbook(rows, totals, students, {
        schoolName:
          (import.meta.env.VITE_SCHOOL_NAME_LO as string | undefined) ??
          (import.meta.env.VITE_SCHOOL_NAME_EN as string | undefined) ??
          '',
        title,
        classSheet: t('report.attendance.classSheet'),
        studentSheet: t('report.attendance.studentSheet'),
        studentTitle: t('report.attendance.studentTitle', { count: threshold, title }),
        number: t('report.attendance.number'),
        classroom: t('attendance.classroom'),
        headcount: t('report.attendance.headcount'),
        recorded: t('report.attendance.recorded'),
        late: t('report.attendance.late'),
        absentExcused: t('attendance.absentExcused'),
        absentUnexcused: t('attendance.absentUnexcused'),
        absentTotal: t('attendance.absentTotal'),
        overThreshold: t('report.attendance.overThreshold', { count: threshold }),
        rate: t('attendance.rate'),
        total: t('report.attendance.total'),
        studentCode: t('attendance.studentCode'),
        student: t('attendance.student'),
        nobody: t('attendance.nobodyOverLine', { count: threshold }),
        note: t('attendance.rateNote', { per: students[0]?.latesPerAbsence ?? 3 }),
        director: t('monthlyMark.director'),
        reporter: t('report.attendance.reporter'),
        signatureDate: t('monthlyMark.signatureDate'),
        printedOn: t('student.exportPrintedOn', { date: formatDate(new Date()) }),
      });
      saveBlob(blob, attendanceSummaryFileName(title));
    } catch (error) {
      notify.error(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="grid gap-3 pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="attendance-report-semester">{t('attendance.semester')}</Label>
            <Select
              value={semesterId ?? ''}
              onValueChange={(next) => {
                setSemesterId(next);
                setMonthKey(WHOLE_TERM);
              }}
            >
              <SelectTrigger id="attendance-report-semester">
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
          <div className="space-y-1.5">
            <Label htmlFor="attendance-report-month">{t('attendance.month')}</Label>
            <Select value={termMonth?.key ?? WHOLE_TERM} onValueChange={setMonthKey}>
              <SelectTrigger id="attendance-report-month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={WHOLE_TERM}>{t('attendance.wholeTerm')}</SelectItem>
                {termMonths.map((month) => (
                  <SelectItem key={month.key} value={month.key}>
                    {t(`month.${month.month}`)} {month.year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="attendance-report-threshold">{t('attendance.absentAtLeast')}</Label>
            <Select
              value={String(threshold)}
              onValueChange={(next) => setThreshold(Number(next))}
            >
              <SelectTrigger id="attendance-report-threshold">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {THRESHOLDS.map((count) => (
                  <SelectItem key={count} value={String(count)}>
                    {t('attendance.absentDaysOption', { count })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              className="w-full sm:w-auto"
              disabled={loading || rows.length === 0 || !absencesReady || busy}
              onClick={exportWorkbook}
            >
              <FileSpreadsheet />
              {t('report.attendance.download')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {failed ? (
        <ErrorState error={failed} onRetry={() => roomsQuery.refetch()} compact />
      ) : loading ? (
        <TableSkeleton rows={6} columns={9} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('report.attendance.noRooms')}
          description={seesEveryStudent ? undefined : t('report.attendance.noRoomsTeacher')}
        />
      ) : (
        <ClassTable rows={rows} totals={totals} threshold={threshold} title={title} />
      )}
    </div>
  );
}

function ClassTable({
  rows,
  totals,
  threshold,
  title,
}: {
  rows: ClassAttendanceRow[];
  totals: AttendanceTotals;
  threshold: number;
  title: string;
}) {
  const { t } = useTranslation();
  const rate = (row: AttendanceTotals) =>
    row.totalRecorded > 0 ? `${row.attendanceRate.toFixed(2)}%` : '—';
  const figures = (row: AttendanceTotals) => [
    row.headcount,
    row.totalRecorded,
    row.lateRemainder,
    row.absentExcused,
    row.absentUnexcused,
    row.absentTotal,
    row.overThreshold,
  ];

  return (
    <div className="space-y-2">
      <h2 className="font-semibold">{title}</h2>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('attendance.classroom')}</TableHead>
              <TableHead className="text-end">{t('report.attendance.headcount')}</TableHead>
              <TableHead className="text-end">{t('report.attendance.recorded')}</TableHead>
              <TableHead className="text-end">{t('report.attendance.late')}</TableHead>
              <TableHead className="text-end">{t('attendance.absentExcused')}</TableHead>
              <TableHead className="text-end">{t('attendance.absentUnexcused')}</TableHead>
              <TableHead className="text-end">{t('attendance.absentTotal')}</TableHead>
              <TableHead className="text-end">
                {t('report.attendance.overThreshold', { count: threshold })}
              </TableHead>
              <TableHead className="text-end">{t('attendance.rate')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.classroomId}>
                <TableCell className="font-medium">{row.label}</TableCell>
                {figures(row).map((value, index) => (
                  <TableCell key={index} className="text-end tabular-nums">
                    {value}
                  </TableCell>
                ))}
                <TableCell className="text-end tabular-nums">{rate(row)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-semibold">{t('report.attendance.total')}</TableCell>
              {figures(totals).map((value, index) => (
                <TableCell key={index} className="text-end font-semibold tabular-nums">
                  {value}
                </TableCell>
              ))}
              <TableCell className="text-end font-semibold tabular-nums">{rate(totals)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}
