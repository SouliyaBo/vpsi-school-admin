import { FileDown, FileText, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { EntitySelect } from '@/components/common/EntitySelect';
import { ErrorState } from '@/components/common/ErrorState';
import { useCan } from '@/features/auth/hooks';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useActiveSemester } from '@/features/semesters/api';
import {
  roomLabel,
  useDownloadMonthlyReport,
  useMonthlyReport,
  useMyHomerooms,
  type MonthlyReport as MonthlyReportData,
} from '../api';
import { ReportEntryForm } from './ReportEntryForm';

/** The calendar months a term touches, in order — ກັນຍາ … ມັງກອນ crosses the year. */
export function termMonths(startDate: string, endDate: string): number[] {
  const months: number[] = [];
  const cursor = new Date(startDate);
  cursor.setUTCDate(1);
  const end = new Date(endDate);
  while (cursor <= end && months.length < 12) {
    months.push(cursor.getUTCMonth() + 1);
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}

/**
 * ຮ່າງບົດສະຫຼຸບຄູປະຈຳຫ້ອງ — the office's monthly form, filled from the records.
 *
 * The screen is a preview of what the system could fill; the Word download is
 * the form itself, with blank rows left for what nobody records here. A teacher
 * is expected to download it, write the rest, and print.
 */
export function MonthlyReport() {
  const { t } = useTranslation();
  const can = useCan();
  const oversees = can('homeroom-reviews', 'manage');
  const semester = useActiveSemester();
  const activeYear = useActiveSchoolYear();
  const rooms = useMyHomerooms();
  const everyRoom = useClassroomOptions('', activeYear.data?.id);
  const useSchoolClassrooms = (search: string) => useClassroomOptions(search, activeYear.data?.id);

  const [params, setParams] = useSearchParams();
  const roomId = params.get('classroomId') ?? undefined;

  const months = useMemo(
    () => (semester.data ? termMonths(semester.data.startDate, semester.data.endDate) : []),
    [semester.data],
  );
  const current = new Date().getMonth() + 1;
  const fallbackMonth = months.includes(current) ? current : months[months.length - 1];
  const month = Number(params.get('month')) || fallbackMonth;

  const setParam = (key: 'classroomId' | 'month', value: string | undefined) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // A teacher with one room lands on it without having to pick it.
  const firstRoomId = rooms.data?.[0]?.classroom.id;
  useEffect(() => {
    if (!roomId && firstRoomId) setParam('classroomId', firstRoomId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, firstRoomId]);

  const report = useMonthlyReport({ classroomId: roomId, month, semesterId: semester.data?.id });
  const download = useDownloadMonthlyReport();

  const roomPicker = oversees ? (
    <div className="w-56">
      <EntitySelect
        id="report-room"
        value={roomId ?? null}
        onChange={(value) => setParam('classroomId', value ?? undefined)}
        useOptions={useSchoolClassrooms}
        selectedLabel={everyRoom.data?.find((option) => option.value === roomId)?.label}
        placeholder={t('homeroomReview.chooseClassroom')}
      />
    </div>
  ) : (
    <Select value={roomId ?? ''} onValueChange={(value) => setParam('classroomId', value)}>
      <SelectTrigger id="report-room" className="w-44">
        <SelectValue placeholder={t('homeroomReview.chooseClassroom')} />
      </SelectTrigger>
      <SelectContent>
        {(rooms.data ?? []).map((room) => (
          <SelectItem key={room.classroom.id} value={room.classroom.id}>
            {roomLabel(room.classroom)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <Label htmlFor="report-room">{t('homeroomReview.classroom')}</Label>
            {roomPicker}
          </div>
          <div className="space-y-1">
            <Label htmlFor="report-month">{t('homeroomReview.report.month')}</Label>
            <Select
              value={month ? String(month) : ''}
              onValueChange={(value) => setParam('month', value)}
            >
              <SelectTrigger id="report-month" className="w-36">
                <SelectValue placeholder={t('homeroomReview.report.month')} />
              </SelectTrigger>
              <SelectContent>
                {months.map((entry) => (
                  <SelectItem key={entry} value={String(entry)}>
                    {t(`month.${entry}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className="ms-auto"
            disabled={!roomId || !month || download.isPending}
            onClick={() =>
              roomId &&
              download.mutate({ classroomId: roomId, month, semesterId: semester.data?.id })
            }
          >
            <FileDown />
            {t('homeroomReview.report.export')}
          </Button>
        </CardContent>
      </Card>

      <p className="flex gap-2 text-sm text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        {t('homeroomReview.report.hint')}
      </p>

      {!roomId ? (
        <EmptyState icon={FileText} title={t('homeroomReview.chooseClassroom')} />
      ) : report.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : report.error ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : report.data ? (
        <>
          <ReportEntryForm
            key={`${report.data.classroom.id}-${report.data.month}`}
            data={report.data}
          />
          <ReportPreview data={report.data} />
        </>
      ) : null}
    </div>
  );
}

function ReportPreview({ data }: { data: MonthlyReportData }) {
  const { t } = useTranslation();
  const name = (row: { studentNameLo: string; studentCode: string | null }) =>
    row.studentCode ? `${row.studentNameLo} (${row.studentCode})` : row.studentNameLo;
  // The reviews' contacts and the ones the teacher added below, as the Word file prints them.
  const guardianContacts = [
    ...data.guardianContacts,
    ...(data.entry.guardianContacts ?? []).map((row) => ({
      ...row,
      studentNameLo: row.allStudents
        ? t('homeroomReview.report.allStudents')
        : (row.studentNameLo ?? ''),
      studentCode: row.allStudents
        ? null
        : (data.roster.find((student) => student.studentId === row.studentId)?.studentCode ?? null),
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const targets = [...new Set(data.tests.subjects.map((s) => `${s.target}/${s.testMax}`))].join(
    ', ',
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('homeroomReview.report.title', { room: data.classroom.name, month: data.monthNameLo })}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('homeroomReview.report.students', {
            count: data.overview.students,
            female: data.overview.female,
          })}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <Section title={t('homeroomReview.report.absenceTitle')}>
          <p className="text-sm">
            {t('homeroomReview.report.absenceTotals', {
              total: data.absence.totalDays,
              excused: data.absence.excusedDays,
              unexcused: data.absence.unexcusedDays,
              lates: data.absence.lateDays,
            })}
          </p>
          <ReportTable
            headers={[t('homeroomReview.report.days'), t('homeroomReview.report.reason')]}
            rows={data.absence.notable.map((row) => [name(row), row.days, row.reasons])}
          />
          <p className="text-sm font-medium">{t('homeroomReview.report.latesTitle')}</p>
          <ReportTable
            headers={[t('homeroomReview.report.days'), t('homeroomReview.report.reason')]}
            rows={data.absence.lates.map((row) => [name(row), row.days, row.reasons])}
          />
        </Section>

        <Section title={t('homeroomReview.report.behaviorTitle')}>
          <ReportTable
            headers={[t('homeroomReview.report.behavior')]}
            rows={data.behavior.map((row) => [name(row), `${row.behaviors} (${row.entries})`])}
          />
        </Section>

        <Section title={t('homeroomReview.report.deductionsTitle')}>
          <ReportTable
            headers={[t('homeroomReview.report.points'), t('homeroomReview.report.reason')]}
            rows={data.deductions.map((row) => [name(row), row.points, row.reasons])}
          />
        </Section>

        <Section title={t('homeroomReview.report.disciplineTitle')}>
          <ReportTable
            headers={[t('homeroomReview.report.handledAt'), t('homeroomReview.report.reason')]}
            rows={data.discipline.map((row) => [name(row), row.handledAt, row.reason])}
          />
        </Section>

        <Section
          title={t('homeroomReview.report.testsTitle', {
            below: data.tests.below.length,
            tested: data.tests.tested,
          })}
        >
          <p className="text-sm text-muted-foreground">
            {t('homeroomReview.report.testsHint', { target: targets })}
          </p>
          <ReportTable
            headers={data.tests.subjects.map((subject) => subject.nameLo)}
            rows={data.tests.below.map((row) => [name(row), ...row.scores])}
          />
        </Section>

        <Section title={t('homeroomReview.report.guardianTitle')}>
          <ReportTable
            headers={[t('homeroomReview.report.date'), t('homeroomReview.report.content')]}
            rows={guardianContacts.map((row) => [name(row), formatDate(row.date), row.content])}
          />
        </Section>

        {data.isSnapshot && (
          <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            {t('homeroomReview.report.snapshotNote')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{title}</h3>
      {children}
    </section>
  );
}

/** ລ/ດ and the name, then `headers` — each row carries the name and the rest. */
function ReportTable({ headers, rows }: { headers: string[]; rows: (string | number | null)[][] }) {
  const { t } = useTranslation();
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t('homeroomReview.report.none')}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">{t('homeroomReview.report.no')}</TableHead>
            <TableHead className="min-w-48">{t('homeroomReview.report.name')}</TableHead>
            {headers.map((header) => (
              <TableHead key={header}>{header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={index}>
              <TableCell>{index + 1}</TableCell>
              {row.map((cell, cellIndex) => (
                <TableCell key={cellIndex}>{cell ?? ''}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
