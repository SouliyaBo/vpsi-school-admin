import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { classroomLabel, useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useSemesterOptions } from '@/features/semesters/api';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { formatDate, fullName, localizedName, nickname, refId, refObject } from '@/lib/utils';
import { StudentName } from '@/components/common/StudentName';
import { useSubjectOptions } from '@/features/subjects/api';
import { useTeacherOptions } from '@/features/teachers/api';
import { ATTENDANCE_STATUSES } from '@/types/enums';
import type { Attendance, Classroom, Student, Subject, Teacher, User } from '@/types/entities';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, TableToolbar } from '@/components/common/TableToolbar';
import { useAttendances } from '../api';

const FILTER_KEYS = [
  'classroomId',
  'semesterId',
  'subjectId',
  'teacherId',
  'status',
  'from',
  'to',
] as const;

/**
 * The attendance log, newest first.
 *
 * This is the "why was my child marked absent on the 12th" screen, so it is
 * filtered rather than searched — the endpoint has no free-text search, and
 * sorts by date itself, which is why no column offers a sort.
 */
export function AttendanceHistory() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();

  const table = useTableQueryState({ filterKeys: FILTER_KEYS });
  const list = useAttendances(table.queryParams);

  const semesterOptions = useSemesterOptions('', activeYear.data?.id);
  const classroomOptions = useClassroomOptions('', activeYear.data?.id);
  const subjectOptions = useSubjectOptions();
  const teacherOptions = useTeacherOptions('');

  const columns = useMemo<ColumnDef<Attendance, unknown>[]>(
    () => [
      {
        id: 'date',
        header: t('attendance.date'),
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="tabular-nums">{formatDate(row.original.date)}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.period === 0
                ? t('attendance.wholeDay')
                : t('attendance.periodN', { number: row.original.period })}
            </p>
          </div>
        ),
      },
      {
        id: 'student',
        header: t('attendance.student'),
        cell: ({ row }) => {
          const student = refObject<Student>(row.original.studentId);
          const studentId = refId(row.original.studentId);
          if (!student) return '—';
          return (
            <div className="leading-tight">
              {studentId ? (
                <Link to={`/students/${studentId}`} className="font-medium hover:underline">
                  <StudentName
                    name={fullName(student, i18n.language)}
                    nickname={nickname(student, i18n.language)}
                  />
                </Link>
              ) : (
                <p className="font-medium">
                  <StudentName
                    name={fullName(student, i18n.language)}
                    nickname={nickname(student, i18n.language)}
                  />
                </p>
              )}
              <p className="text-xs text-muted-foreground">{student.studentCode}</p>
            </div>
          );
        },
      },
      {
        id: 'classroom',
        header: t('attendance.classroom'),
        cell: ({ row }) => {
          const classroom = refObject<Classroom>(row.original.classroomId);
          return classroom ? classroomLabel(classroom) : '—';
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'subject',
        header: t('attendance.subject'),
        cell: ({ row }) => {
          const subject = refObject<Subject>(row.original.subjectId);
          return subject ? localizedName(subject, i18n.language) : '—';
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'teacher',
        header: t('attendance.teacher'),
        // Two names, not one: the timetabled teacher owns the lesson, but an
        // office user may have filed it for them. Showing only the first hides
        // who actually took the roll call; only the second misattributes the
        // lesson. The second line appears only when they differ.
        cell: ({ row }) => {
          const teacher = refObject<Teacher>(row.original.teacherId);
          const recordedBy = refObject<User>(row.original.recordedBy);
          const teacherName = teacher ? fullName(teacher, i18n.language) : '—';
          const filedByOther = recordedBy && recordedBy.personId !== refId(row.original.teacherId);

          return (
            <div className="leading-tight">
              <p>{teacherName}</p>
              {filedByOther && (
                <p className="text-xs text-muted-foreground">
                  {t('attendance.recordedByName', { username: recordedBy.username })}
                </p>
              )}
            </div>
          );
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'status',
        header: t('attendance.status'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={row.original.status} namespace="attendanceStatus" />
            {row.original.status === 'late' && row.original.minutesLate != null && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {t('attendance.minutesLateValue', { count: row.original.minutesLate })}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'reason',
        header: t('attendance.reason'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.reason || '—'}</span>
        ),
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language],
  );

  return (
    <DataTable
      columns={columns}
      result={list.data}
      isLoading={list.isLoading}
      isFetching={list.isFetching}
      error={list.error}
      onRetry={list.refetch}
      onPageChange={table.setPage}
      onLimitChange={table.setLimit}
      getRowId={(row) => row.id}
      emptyTitle={t('attendance.emptyHistory')}
      emptyDescription={t('attendance.emptyHistoryHint')}
      toolbar={
        <TableToolbar hasActiveFilters={table.hasActiveFilters} onClearFilters={table.clearFilters}>
          <FilterSelect
            value={table.filters.classroomId}
            onChange={(value) => table.setFilter('classroomId', value)}
            options={classroomOptions.data ?? []}
            placeholder={t('attendance.classroom')}
          />
          <FilterSelect
            value={table.filters.semesterId}
            onChange={(value) => table.setFilter('semesterId', value)}
            options={semesterOptions.data ?? []}
            placeholder={t('attendance.semester')}
          />
          <FilterSelect
            value={table.filters.subjectId}
            onChange={(value) => table.setFilter('subjectId', value)}
            options={subjectOptions.data ?? []}
            placeholder={t('attendance.subject')}
          />
          <FilterSelect
            value={table.filters.teacherId}
            onChange={(value) => table.setFilter('teacherId', value)}
            options={teacherOptions.data ?? []}
            placeholder={t('attendance.teacher')}
          />
          <FilterSelect
            value={table.filters.status}
            onChange={(value) => table.setFilter('status', value)}
            options={ATTENDANCE_STATUSES.map((status) => ({
              value: status,
              label: t(`attendanceStatus.${status}`),
            }))}
            placeholder={t('attendance.status')}
          />

          <div className="flex items-center gap-1.5">
            <Label htmlFor="attendance-from" className="text-xs text-muted-foreground">
              {t('attendance.from')}
            </Label>
            <Input
              id="attendance-from"
              type="date"
              className="h-9 w-auto"
              value={table.filters.from ?? ''}
              onChange={(event) => table.setFilter('from', event.target.value || undefined)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="attendance-to" className="text-xs text-muted-foreground">
              {t('attendance.to')}
            </Label>
            <Input
              id="attendance-to"
              type="date"
              className="h-9 w-auto"
              value={table.filters.to ?? ''}
              onChange={(event) => table.setFilter('to', event.target.value || undefined)}
            />
          </div>
        </TableToolbar>
      }
    />
  );
}
