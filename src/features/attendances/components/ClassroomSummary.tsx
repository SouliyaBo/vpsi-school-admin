import { BarChart3 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCan } from '@/features/auth/hooks';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useClassRoster } from '@/features/enrollments/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useActiveSemester, useSemesterOptions } from '@/features/semesters/api';
import { cn, nickname, refId, refObject } from '@/lib/utils';
import type { Student } from '@/types/entities';
import { Card, CardContent } from '@/components/ui/card';
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
import { StudentName } from '@/components/common/StudentName';
import { useClassroomAttendanceSummary, type AttendanceSummary } from '../api';

/** Below this, an attendance rate is worth flagging rather than just reporting. */
const AT_RISK_RATE = 80;

/** One row: a student from the roster, with whatever the summary knows about them. */
interface SummaryRow extends AttendanceSummary {
  studentCode: string;
  studentName: string;
  studentNickname: string | null;
  rollNumber?: number | null;
}

const EMPTY_COUNTS = {
  present: 0,
  absent: 0,
  late: 0,
  excused: 0,
  sick: 0,
  totalRecorded: 0,
  attendanceRate: 0,
};

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

  const semesterOptions = useSemesterOptions('', activeYear.data?.id);
  const useClassroomsForYear = (search: string) => useClassroomOptions(search, activeYear.data?.id);

  const summary = useClassroomAttendanceSummary(classroomId, effectiveSemesterId);
  // Names live on the enrollment, so a role without `enrollments:read` gets the
  // counts without them rather than a 403 it cannot act on.
  const canReadRoster = can('enrollments');
  const roster = useClassRoster(canReadRoster ? classroomId : undefined);

  const rows = useMemo<SummaryRow[]>(() => {
    const byStudent = new Map((summary.data ?? []).map((row) => [row.studentId, row]));

    if (!canReadRoster) {
      return (summary.data ?? []).map((row) => ({
        ...row,
        studentCode: '—',
        studentName: '—',
        studentNickname: null,
        rollNumber: null,
      }));
    }

    return (roster.data ?? []).map((enrollment) => {
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
    });
  }, [summary.data, roster.data, canReadRoster]);

  const isLoading = summary.isLoading || (canReadRoster && roster.isLoading);
  const error = summary.error ?? roster.error;

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
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5">
          {!classroomId || !effectiveSemesterId ? (
            <EmptyState icon={BarChart3} title={t('attendance.summaryHint')} />
          ) : isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }, (_, index) => (
                <Skeleton key={index} className="h-9 w-full" />
              ))}
            </div>
          ) : error ? (
            <ErrorState error={error} onRetry={summary.refetch} compact />
          ) : rows.length === 0 ? (
            <EmptyState icon={BarChart3} title={t('attendance.emptySummary')} />
          ) : (
            <div className="scrollbar-thin overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">{t('attendance.rollNumber')}</TableHead>
                    <TableHead>{t('attendance.student')}</TableHead>
                    <TableHead className="text-center">{t('attendanceStatus.present')}</TableHead>
                    <TableHead className="text-center">{t('attendanceStatus.absent')}</TableHead>
                    <TableHead className="text-center">{t('attendanceStatus.late')}</TableHead>
                    <TableHead className="hidden text-center md:table-cell">
                      {t('attendanceStatus.excused')}
                    </TableHead>
                    <TableHead className="hidden text-center md:table-cell">
                      {t('attendanceStatus.sick')}
                    </TableHead>
                    <TableHead className="w-40">{t('attendance.rate')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.studentId}>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {row.rollNumber ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/students/${row.studentId}`}
                          className="font-medium hover:underline"
                        >
                          <StudentName name={row.studentName} nickname={row.studentNickname} />
                        </Link>
                        <p className="text-xs text-muted-foreground">{row.studentCode}</p>
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{row.present}</TableCell>
                      <TableCell
                        className={cn(
                          'text-center tabular-nums',
                          row.absent > 0 && 'font-medium text-danger',
                        )}
                      >
                        {row.absent}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{row.late}</TableCell>
                      <TableCell className="hidden text-center tabular-nums md:table-cell">
                        {row.excused}
                      </TableCell>
                      <TableCell className="hidden text-center tabular-nums md:table-cell">
                        {row.sick}
                      </TableCell>
                      <TableCell>
                        {row.totalRecorded === 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {t('attendance.notRecorded')}
                          </span>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{t('attendance.rateNote')}</p>
    </div>
  );
}
