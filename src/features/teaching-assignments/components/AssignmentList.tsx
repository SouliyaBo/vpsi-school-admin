import type { ColumnDef } from '@tanstack/react-table';
import { CopyPlus, Pencil, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { classroomLabel, useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { useSemesterOptions } from '@/features/semesters/api';
import { useTeacherOptions } from '@/features/teachers/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { notify } from '@/lib/toast';
import { fullName, localizedName, refObject } from '@/lib/utils';
import type { Classroom, Subject, Teacher, TeachingAssignment } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { RowActions } from '@/components/common/RowActions';
import { FilterSelect, TableToolbar } from '@/components/common/TableToolbar';
import { teachingAssignments, useUpdateAssignment } from '../api';
import { formatPeriodTime, weekdayKey } from '../schedule';
import { AssignmentFormDialog } from './AssignmentFormDialog';
import { BulkAssignDialog } from './BulkAssignDialog';

/**
 * Every posting, filterable by semester, class and teacher.
 *
 * The endpoint sorts by creation date and ignores `sortBy`, so no column offers
 * a sort — the three filters are how a row is found. It also has no free-text
 * search, which is why the toolbar carries no search box.
 */
export function AssignmentList() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const activeYear = useActiveSchoolYear();

  const table = useTableQueryState({
    filterKeys: ['semesterId', 'classroomId', 'teacherId'],
  });
  const dialogs = useCrudDialogs<TeachingAssignment>();
  // Its own flag: the batch dialog has no `record`, so it is not a CRUD dialog.
  const [bulkOpen, setBulkOpen] = useState(false);

  const list = teachingAssignments.useList(table.queryParams);
  const remove = teachingAssignments.useDelete();
  const update = useUpdateAssignment();

  const semesterOptions = useSemesterOptions('', activeYear.data?.id);
  const classroomOptions = useClassroomOptions('', activeYear.data?.id);
  const teacherOptions = useTeacherOptions('');

  function toggleActive(assignment: TeachingAssignment) {
    update
      .mutateAsync({ id: assignment.id, body: { isActive: !assignment.isActive } })
      .catch((error: unknown) => notify.error(error));
  }

  const columns = useMemo<ColumnDef<TeachingAssignment, unknown>[]>(
    () => [
      {
        id: 'teacher',
        header: t('assignment.teacher'),
        cell: ({ row }) => {
          const teacher = refObject<Teacher>(row.original.teacherId);
          if (!teacher) return '—';
          return (
            <div className="leading-tight">
              <p className="font-medium">{fullName(teacher, i18n.language)}</p>
              <p className="text-xs text-muted-foreground">{teacher.teacherCode}</p>
            </div>
          );
        },
      },
      {
        id: 'subject',
        header: t('assignment.subject'),
        cell: ({ row }) => {
          const subject = refObject<Subject>(row.original.subjectId);
          if (!subject) return '—';
          return (
            <div className="leading-tight">
              <p>{localizedName(subject, i18n.language)}</p>
              <p className="text-xs text-muted-foreground">{subject.code}</p>
            </div>
          );
        },
      },
      {
        id: 'classroom',
        header: t('assignment.classroom'),
        // Grade-qualified: one teacher commonly takes the same section letter
        // across several levels, and "A" three times over says nothing.
        cell: ({ row }) => {
          const room = refObject<Classroom>(row.original.classroomId);
          return room ? classroomLabel(room) : '—';
        },
      },
      {
        id: 'schedule',
        header: t('assignment.schedule'),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.schedule.map((period, index) => (
              <Badge key={index} variant="secondary" className="tabular-nums">
                {t(weekdayKey(period.dayOfWeek))} {formatPeriodTime(period)}
                {period.room ? ` · ${period.room}` : ''}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: 'periods',
        header: t('assignment.periodsHeader'),
        cell: ({ row }) => row.original.schedule.length,
        meta: { hideOnMobile: true, className: 'text-center' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'isActive',
        header: t('person.status'),
        cell: ({ row }) => (
          <Badge variant={row.original.isActive ? 'success' : 'secondary'}>
            {row.original.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: t('common.edit'),
                icon: Pencil,
                hidden: !can('teaching-assignments', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: row.original.isActive
                  ? t('assignment.deactivate')
                  : t('assignment.activate'),
                icon: row.original.isActive ? PowerOff : Power,
                hidden: !can('teaching-assignments', 'update'),
                onSelect: () => toggleActive(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('teaching-assignments', 'delete'),
                onSelect: () => dialogs.askDelete(row.original),
              },
            ]}
          />
        ),
        meta: { className: 'w-12 text-end' } satisfies DataTableColumnMeta,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, i18n.language, can, dialogs],
  );

  return (
    <div className="space-y-3">
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
        emptyTitle={t('assignment.empty')}
        emptyAction={
          can('teaching-assignments', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('assignment.create')}
            </Button>
          )
        }
        toolbar={
          <TableToolbar
            hasActiveFilters={table.hasActiveFilters}
            onClearFilters={table.clearFilters}
          >
            <FilterSelect
              value={table.filters.semesterId}
              onChange={(value) => table.setFilter('semesterId', value)}
              options={semesterOptions.data ?? []}
              placeholder={t('assignment.semester')}
            />
            <FilterSelect
              value={table.filters.classroomId}
              onChange={(value) => table.setFilter('classroomId', value)}
              options={classroomOptions.data ?? []}
              placeholder={t('assignment.classroom')}
            />
            <FilterSelect
              value={table.filters.teacherId}
              onChange={(value) => table.setFilter('teacherId', value)}
              options={teacherOptions.data ?? []}
              placeholder={t('assignment.teacher')}
            />
            {can('teaching-assignments', 'create') && (
              <div className="ms-auto flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                  <CopyPlus />
                  {t('assignment.bulkCreate')}
                </Button>
                <Button size="sm" onClick={dialogs.openCreate}>
                  <Plus />
                  {t('assignment.create')}
                </Button>
              </div>
            )}
          </TableToolbar>
        }
      />

      <AssignmentFormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        assignment={dialogs.record}
        defaultSemesterId={table.filters.semesterId}
      />

      <BulkAssignDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        defaultSemesterId={table.filters.semesterId}
      />

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('assignment.deleteConfirm')}
        description={dialogs.deleteTarget ? summarize(dialogs.deleteTarget, i18n.language) : undefined}
        isPending={remove.isPending}
        onConfirm={() => {
          if (!dialogs.deleteTarget) return;
          void remove.mutateAsync(dialogs.deleteTarget.id).finally(dialogs.cancelDelete);
        }}
      />
    </div>
  );
}

function summarize(assignment: TeachingAssignment, locale: string): string {
  const teacher = refObject<Teacher>(assignment.teacherId);
  const subject = refObject<Subject>(assignment.subjectId);
  const classroom = refObject<Classroom>(assignment.classroomId);

  return [
    teacher ? fullName(teacher, locale) : null,
    subject ? localizedName(subject, locale) : null,
    classroom ? classroomLabel(classroom) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
