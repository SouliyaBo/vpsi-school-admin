import type { ColumnDef } from '@tanstack/react-table';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { classroomLabel, useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useSemesterOptions } from '@/features/semesters/api';
import { useSubjectOptions } from '@/features/subjects/api';
import { useTeacherOptions } from '@/features/teachers/api';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { formatDate, fullName, localizedName, nickname, refId, refObject } from '@/lib/utils';
import { StudentName } from '@/components/common/StudentName';
import type { BehaviorLog, Classroom, Student, Subject, Teacher } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { FilterSelect, TableToolbar } from '@/components/common/TableToolbar';
import { useBehaviorLogs } from '../api';

const FILTER_KEYS = [
  'classroomId',
  'semesterId',
  'subjectId',
  'teacherId',
  'from',
  'to',
] as const;

/**
 * The register read backwards, newest first, one line per student.
 *
 * The monthly sheet cannot answer "what has this student done this term" — it is
 * scoped to a class and a month, and a student's entries are scattered across
 * rows that also name other people. This is the screen a homeroom teacher opens
 * before a meeting with a parent, so it filters rather than searches: the
 * endpoint has no free-text search and sorts by date itself.
 *
 * Rows with no student are the sheet's class-level notes; they show as such
 * rather than being hidden, since a term's worth of "the class was noisy again"
 * is itself the record.
 */
export function BehaviorHistory() {
  const { t, i18n } = useTranslation();
  const activeYear = useActiveSchoolYear();

  const table = useTableQueryState({ filterKeys: FILTER_KEYS });
  const list = useBehaviorLogs(table.queryParams);

  const semesterOptions = useSemesterOptions('', activeYear.data?.id);
  const classroomOptions = useClassroomOptions('', activeYear.data?.id);
  const subjectOptions = useSubjectOptions();
  const teacherOptions = useTeacherOptions('');

  const columns = useMemo<ColumnDef<BehaviorLog, unknown>[]>(
    () => [
      {
        id: 'date',
        header: t('behaviorLog.date'),
        cell: ({ row }) => (
          <div className="leading-tight">
            <p className="tabular-nums">{formatDate(row.original.date)}</p>
            <p className="text-xs text-muted-foreground">
              {t('behaviorLog.periodN', { number: row.original.period })}
            </p>
          </div>
        ),
      },
      {
        id: 'student',
        header: t('behaviorLog.studentName'),
        cell: ({ row }) => {
          const student = refObject<Student>(row.original.studentId ?? undefined);
          const studentId = refId(row.original.studentId ?? undefined);
          if (!student) {
            return (
              <Badge variant="secondary" className="font-normal">
                {t('behaviorLog.wholeClass')}
              </Badge>
            );
          }
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
        header: t('behaviorLog.classroom'),
        cell: ({ row }) => {
          const classroom = refObject<Classroom>(row.original.classroomId);
          return classroom ? classroomLabel(classroom) : '—';
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'behavior',
        header: t('behaviorLog.behavior'),
        // The class note is the fallback rather than a column of its own: on a
        // student row it repeats down every line of the entry, and on a
        // class-level row it is the only thing there is to show.
        cell: ({ row }) =>
          row.original.behavior ? (
            <span className="text-sm">{row.original.behavior}</span>
          ) : (
            <span className="text-sm text-muted-foreground">{row.original.classNote || '—'}</span>
          ),
      },
      {
        id: 'action',
        header: t('behaviorLog.action'),
        cell: ({ row }) =>
          row.original.action ? (
            <Badge variant="warning">{row.original.action}</Badge>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'subject',
        header: t('behaviorLog.subject'),
        cell: ({ row }) => {
          const subject = refObject<Subject>(row.original.subjectId);
          return subject ? localizedName(subject, i18n.language) : '—';
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'teacher',
        header: t('behaviorLog.teacher'),
        cell: ({ row }) => {
          const teacher = refObject<Teacher>(row.original.teacherId);
          return teacher ? fullName(teacher, i18n.language) : '—';
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'remark',
        header: t('behaviorLog.remark'),
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">{row.original.remark || '—'}</span>
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
      emptyTitle={t('behaviorLog.emptyHistory')}
      emptyDescription={t('behaviorLog.emptyHistoryHint')}
      toolbar={
        <TableToolbar hasActiveFilters={table.hasActiveFilters} onClearFilters={table.clearFilters}>
          <FilterSelect
            value={table.filters.classroomId}
            onChange={(value) => table.setFilter('classroomId', value)}
            options={classroomOptions.data ?? []}
            placeholder={t('behaviorLog.classroom')}
          />
          <FilterSelect
            value={table.filters.semesterId}
            onChange={(value) => table.setFilter('semesterId', value)}
            options={semesterOptions.data ?? []}
            placeholder={t('behaviorLog.semester')}
          />
          <FilterSelect
            value={table.filters.subjectId}
            onChange={(value) => table.setFilter('subjectId', value)}
            options={subjectOptions.data ?? []}
            placeholder={t('behaviorLog.subject')}
          />
          <FilterSelect
            value={table.filters.teacherId}
            onChange={(value) => table.setFilter('teacherId', value)}
            options={teacherOptions.data ?? []}
            placeholder={t('behaviorLog.teacher')}
          />

          <div className="flex items-center gap-1.5">
            <Label htmlFor="behavior-from" className="text-xs text-muted-foreground">
              {t('behaviorLog.from')}
            </Label>
            <Input
              id="behavior-from"
              type="date"
              className="h-9 w-auto"
              value={table.filters.from ?? ''}
              onChange={(event) => table.setFilter('from', event.target.value || undefined)}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="behavior-to" className="text-xs text-muted-foreground">
              {t('behaviorLog.to')}
            </Label>
            <Input
              id="behavior-to"
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
