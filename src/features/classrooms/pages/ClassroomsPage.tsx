import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCan } from '@/features/auth/hooks';
import { useGradeLevelOptions } from '@/features/grade-levels/api';
import { useSchoolYearOptions } from '@/features/school-years/api';
import { useTeacherOptions } from '@/features/teachers/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { stripEmpty } from '@/lib/payload';
import { cn, fullName, refId, refObject } from '@/lib/utils';
import { optionalId, optionalText, requiredId, requiredNumber, requiredText } from '@/lib/zod-helpers';
import type { Classroom, GradeLevel, Teacher } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Progress } from '@/components/ui/progress';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { FieldSection, NumberField, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { FilterSelect, SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import {
  classroomLabel,
  classrooms,
  type ClassroomInput,
  type ClassroomUpdateInput,
} from '../api';

const schema = z.object({
  schoolYearId: requiredId(),
  gradeLevelId: requiredId(),
  name: requiredText(20),
  homeroomTeacherId: optionalId(),
  capacity: requiredNumber({ min: 1, max: 200, integer: true }),
  room: optionalText(30),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  schoolYearId: '',
  gradeLevelId: '',
  name: '',
  homeroomTeacherId: '',
  capacity: 45,
  room: '',
};

export function ClassroomsPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const table = useTableQueryState({
    defaultSortBy: 'name',
    defaultSortOrder: 'asc',
    filterKeys: ['schoolYearId', 'gradeLevelId'],
  });
  const dialogs = useCrudDialogs<Classroom>();

  const list = classrooms.useList(table.queryParams);
  const create = classrooms.useCreate();
  const update = classrooms.useUpdate();
  const remove = classrooms.useDelete();
  const yearOptions = useSchoolYearOptions();
  const gradeOptions = useGradeLevelOptions();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!dialogs.formOpen) return;
    form.reset(
      dialogs.record
        ? {
            schoolYearId: refId(dialogs.record.schoolYearId) ?? '',
            gradeLevelId: refId(dialogs.record.gradeLevelId) ?? '',
            name: dialogs.record.name,
            homeroomTeacherId: refId(dialogs.record.homeroomTeacherId) ?? '',
            capacity: dialogs.record.capacity,
            room: dialogs.record.room ?? '',
          }
        : {
            ...EMPTY,
            schoolYearId: table.filters.schoolYearId ?? '',
            gradeLevelId: table.filters.gradeLevelId ?? '',
          },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogs.formOpen, dialogs.record, form]);

  const columns = useMemo<ColumnDef<Classroom, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('classroom.name'),
        cell: ({ row }) => <span className="font-medium">{classroomLabel(row.original)}</span>,
        meta: { sortKey: 'name' } satisfies DataTableColumnMeta,
      },
      {
        id: 'gradeLevel',
        header: t('gradeLevel.title'),
        cell: ({ row }) => {
          const grade = refObject<GradeLevel>(row.original.gradeLevelId);
          return grade?.code ?? '—';
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'homeroomTeacher',
        header: t('classroom.homeroomTeacher'),
        cell: ({ row }) => {
          const teacher = refObject<Teacher>(row.original.homeroomTeacherId);
          return teacher ? fullName(teacher, i18n.language) : '—';
        },
      },
      {
        id: 'occupancy',
        header: t('classroom.occupancy'),
        cell: ({ row }) => {
          const { currentCount, capacity } = row.original;
          const ratio = capacity > 0 ? Math.round((currentCount / capacity) * 100) : 0;
          return (
            <div className="flex min-w-32 items-center gap-2">
              <Progress
                value={Math.min(ratio, 100)}
                // Full or over-subscribed rooms read as a warning, not a neutral bar.
                className={cn('h-1.5 flex-1', ratio >= 100 && '[&>div]:bg-warning')}
              />
              <span className="whitespace-nowrap text-xs text-muted-foreground">
                {currentCount}/{capacity}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: 'room',
        header: t('classroom.room'),
        cell: ({ row }) => row.original.room ?? '—',
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
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
                hidden: !can('classrooms', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('classrooms', 'delete'),
                onSelect: () => dialogs.askDelete(row.original),
              },
            ]}
          />
        ),
        meta: { className: 'w-12 text-end' } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language, can, dialogs],
  );

  function submit(values: FormValues) {
    if (dialogs.record) {
      const { schoolYearId: _year, gradeLevelId: _grade, homeroomTeacherId, ...rest } = values;
      void update
        .mutateAsync({
          id: dialogs.record.id,
          body: {
            ...(stripEmpty(rest) as ClassroomUpdateInput),
            // Sent explicitly rather than dropped as a blank, so unpicking the
            // teacher actually clears them instead of silently keeping the old one.
            homeroomTeacherId: homeroomTeacherId || null,
          },
        })
        .then(dialogs.closeForm)
        .catch(() => {});
      return;
    }

    void create
      .mutateAsync(stripEmpty(values) as ClassroomInput)
      .then(dialogs.closeForm)
      .catch(() => {});
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('classroom.title')}
        actions={
          can('classrooms', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('classroom.create')}
            </Button>
          )
        }
      />

      <DataTable
        columns={columns}
        result={list.data}
        isLoading={list.isLoading}
        isFetching={list.isFetching}
        error={list.error}
        onRetry={list.refetch}
        sortBy={table.sortBy}
        sortOrder={table.sortOrder}
        onSortChange={table.setSort}
        onPageChange={table.setPage}
        onLimitChange={table.setLimit}
        getRowId={(row) => row.id}
        toolbar={
          <TableToolbar hasActiveFilters={table.hasActiveFilters} onClearFilters={table.clearFilters}>
            <SearchInput value={table.search ?? ''} onChange={table.setSearch} className="w-full sm:w-56" />
            <FilterSelect
              value={table.filters.schoolYearId}
              onChange={(value) => table.setFilter('schoolYearId', value)}
              options={yearOptions.data ?? []}
              placeholder={t('semester.schoolYear')}
            />
            <FilterSelect
              value={table.filters.gradeLevelId}
              onChange={(value) => table.setFilter('gradeLevelId', value)}
              options={gradeOptions.data ?? []}
              placeholder={t('gradeLevel.title')}
            />
          </TableToolbar>
        }
      />

      <FormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        title={dialogs.isEditing ? t('classroom.edit') : t('classroom.create')}
        onSubmit={form.handleSubmit(submit)}
        isSubmitting={create.isPending || update.isPending}
        size="lg"
      >
        <Form {...form}>
          <FieldSection>
            {/* Fixed once the class exists: its year and grade are what its
                enrollments, timetable and results are filed under. */}
            <EntitySelectField
              control={form.control}
              name="schoolYearId"
              label={t('semester.schoolYear')}
              required
              disabled={dialogs.isEditing}
              useOptions={useSchoolYearOptions}
            />
            <EntitySelectField
              control={form.control}
              name="gradeLevelId"
              label={t('gradeLevel.title')}
              required
              disabled={dialogs.isEditing}
              useOptions={useGradeLevelOptions}
            />
            <TextField
              control={form.control}
              name="name"
              label={t('classroom.name')}
              description={t('classroom.nameHint')}
              required
            />
            <NumberField
              control={form.control}
              name="capacity"
              label={t('classroom.capacity')}
              required
              min={1}
              max={200}
            />
            <EntitySelectField
              control={form.control}
              name="homeroomTeacherId"
              label={t('classroom.homeroomTeacher')}
              useOptions={useTeacherOptions}
              searchPlaceholder={t('teacher.title')}
            />
            <TextField control={form.control} name="room" label={t('classroom.room')} />
          </FieldSection>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={dialogs.deleteTarget ? classroomLabel(dialogs.deleteTarget) : undefined}
        isPending={remove.isPending}
        onConfirm={() => {
          if (!dialogs.deleteTarget) return;
          void remove.mutateAsync(dialogs.deleteTarget.id).finally(dialogs.cancelDelete);
        }}
      />
    </div>
  );
}
