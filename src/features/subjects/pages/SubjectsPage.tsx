import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCan } from '@/features/auth/hooks';
import { useGradeLevelOptions } from '@/features/grade-levels/api';
import { useSubjectGroupOptions } from '@/features/subject-groups/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { stripEmpty } from '@/lib/payload';
import { localizedName, refId, refObject } from '@/lib/utils';
import {
  optionalId,
  optionalNumber,
  optionalText,
  requiredId,
  requiredNumber,
  requiredText,
} from '@/lib/zod-helpers';
import { SUBJECT_TYPES } from '@/types/enums';
import type { GradeLevel, Subject, SubjectGroup } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { FieldSection, NumberField, SelectField, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { subjects, type SubjectInput } from '../api';

const schema = z.object({
  code: requiredText(30),
  nameLo: requiredText(120),
  nameEn: optionalText(120),
  gradeLevelId: requiredId(),
  // Optional, not required: the subject rows predate the departments, so the
  // form must be able to save one that has not been filed yet.
  subjectGroupId: optionalId(),
  type: z.enum(SUBJECT_TYPES),
  credits: requiredNumber({ min: 0 }),
  hoursPerWeek: requiredNumber({ min: 0 }),
  // Left blank, the API falls back to the global grading setting.
  passingPercentage: optionalNumber({ min: 0, max: 100 }),
  // Comma-separated on the form, a list on the wire: they are columns on the
  // mark sheet, and typing them is faster than managing rows of them.
  strands: optionalText(200),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  code: '',
  nameLo: '',
  nameEn: '',
  gradeLevelId: '',
  subjectGroupId: undefined,
  type: 'core',
  credits: 1,
  hoursPerWeek: 0,
  passingPercentage: undefined,
  strands: '',
};

export function SubjectsPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const table = useTableQueryState({
    defaultSortBy: 'code',
    defaultSortOrder: 'asc',
    filterKeys: ['gradeLevelId', 'subjectGroupId', 'type'],
  });
  const dialogs = useCrudDialogs<Subject>();

  const list = subjects.useList(table.queryParams);
  const create = subjects.useCreate();
  const update = subjects.useUpdate();
  const remove = subjects.useDelete();
  const gradeOptions = useGradeLevelOptions();
  const groupOptions = useSubjectGroupOptions();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!dialogs.formOpen) return;
    form.reset(
      dialogs.record
        ? {
            code: dialogs.record.code,
            nameLo: dialogs.record.nameLo,
            nameEn: dialogs.record.nameEn ?? '',
            gradeLevelId: refId(dialogs.record.gradeLevelId) ?? '',
            subjectGroupId: refId(dialogs.record.subjectGroupId) ?? undefined,
            type: dialogs.record.type,
            credits: dialogs.record.credits,
            hoursPerWeek: dialogs.record.hoursPerWeek,
            passingPercentage: dialogs.record.passingPercentage ?? undefined,
            strands: (dialogs.record.strands ?? []).join(', '),
          }
        : { ...EMPTY, gradeLevelId: table.filters.gradeLevelId ?? '' },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogs.formOpen, dialogs.record, form]);

  const columns = useMemo<ColumnDef<Subject, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('common.code'),
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
        meta: { sortKey: 'code' } satisfies DataTableColumnMeta,
      },
      {
        id: 'name',
        header: t('common.name'),
        cell: ({ row }) => localizedName(row.original, i18n.language),
      },
      {
        id: 'gradeLevel',
        header: t('gradeLevel.title'),
        cell: ({ row }) => {
          const grade = refObject<GradeLevel>(row.original.gradeLevelId);
          return grade ? `${grade.code}` : '—';
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'subjectGroup',
        header: t('subjectGroup.title'),
        cell: ({ row }) => {
          const group = refObject<SubjectGroup>(row.original.subjectGroupId);
          // An ungrouped subject is a real gap: its lesson plans land in the
          // matrix's unassigned bucket and route to no particular head.
          return group ? (
            localizedName(group, i18n.language)
          ) : (
            <span className="text-warning">{t('subject.noGroup')}</span>
          );
        },
      },
      {
        accessorKey: 'type',
        header: t('subject.type'),
        cell: ({ row }) => <StatusBadge status={row.original.type} namespace="subjectType" />,
      },
      {
        accessorKey: 'credits',
        header: t('subject.credits'),
        cell: ({ row }) => row.original.credits,
        meta: { sortKey: 'credits', className: 'text-end w-24' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'hoursPerWeek',
        header: t('subject.hoursPerWeek'),
        cell: ({ row }) => row.original.hoursPerWeek,
        meta: { className: 'text-end w-28', hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'passingPercentage',
        header: t('subject.passingPercentage'),
        cell: ({ row }) =>
          row.original.passingPercentage != null ? `${row.original.passingPercentage}%` : '—',
        meta: { className: 'text-end w-28', hideOnMobile: true } satisfies DataTableColumnMeta,
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
                hidden: !can('subjects', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('subjects', 'delete'),
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
    // A subject's code and grade level are fixed at creation — the API's update
    // DTO does not accept them, and it rejects unknown properties rather than
    // ignoring them, so sending the whole form back fails the save outright.
    const { code: _code, gradeLevelId: _grade, strands: _strands, ...updatable } = values;

    // Sent as a list either way, so clearing the field marks the subject as one
    // rather than leaving yesterday's strands on it.
    const strands = (values.strands ?? '')
      .split(',')
      .map((strand) => strand.trim())
      .filter(Boolean);

    const mutation = dialogs.record
      ? update.mutateAsync({
          id: dialogs.record.id,
          // The department is sent explicitly rather than stripped, so clearing it
          // detaches the subject instead of silently leaving the old group.
          body: {
            ...stripEmpty(updatable),
            subjectGroupId: values.subjectGroupId ?? null,
            strands,
          },
        })
      : create.mutateAsync({ ...stripEmpty(values), strands } as SubjectInput);
    void mutation.then(dialogs.closeForm).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('subject.title')}
        actions={
          can('subjects', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('subject.create')}
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
          <TableToolbar
            hasActiveFilters={table.hasActiveFilters}
            onClearFilters={table.clearFilters}
          >
            <SearchInput
              value={table.search ?? ''}
              onChange={table.setSearch}
              className="w-full sm:w-56"
            />
            <FilterSelect
              value={table.filters.gradeLevelId}
              onChange={(value) => table.setFilter('gradeLevelId', value)}
              options={gradeOptions.data ?? []}
              placeholder={t('gradeLevel.title')}
            />
            <FilterSelect
              value={table.filters.subjectGroupId}
              onChange={(value) => table.setFilter('subjectGroupId', value)}
              options={groupOptions.data ?? []}
              placeholder={t('subjectGroup.title')}
            />
            <FilterSelect
              value={table.filters.type}
              onChange={(value) => table.setFilter('type', value)}
              options={SUBJECT_TYPES.map((type) => ({
                value: type,
                label: t(`subjectType.${type}`),
              }))}
              placeholder={t('subject.type')}
            />
          </TableToolbar>
        }
      />

      <FormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        title={dialogs.isEditing ? t('subject.edit') : t('subject.create')}
        onSubmit={form.handleSubmit(submit)}
        isSubmitting={create.isPending || update.isPending}
        size="lg"
      >
        <Form {...form}>
          <FieldSection>
            {/* Both fixed once the subject exists: the code identifies it in
                every timetable and result, and its grade level is what the
                curriculum files it under. */}
            <TextField
              control={form.control}
              name="code"
              label={t('common.code')}
              required
              disabled={dialogs.isEditing}
            />
            <EntitySelectField
              control={form.control}
              name="gradeLevelId"
              label={t('gradeLevel.title')}
              required
              disabled={dialogs.isEditing}
              useOptions={useGradeLevelOptions}
            />
            {/* The department, unlike the grade level, stays editable: a school
                reorganises its groups without the subject itself changing. */}
            <EntitySelectField
              control={form.control}
              name="subjectGroupId"
              label={t('subjectGroup.title')}
              description={t('subject.groupHint')}
              useOptions={useSubjectGroupOptions}
              className="sm:col-span-2"
            />
            <TextField control={form.control} name="nameLo" label={t('common.nameLo')} required />
            <TextField control={form.control} name="nameEn" label={t('common.nameEn')} />
            <SelectField
              control={form.control}
              name="type"
              label={t('subject.type')}
              required
              options={SUBJECT_TYPES.map((type) => ({
                value: type,
                label: t(`subjectType.${type}`),
              }))}
            />
            <NumberField
              control={form.control}
              name="credits"
              label={t('subject.credits')}
              required
              min={0}
              step={0.5}
            />
            <NumberField
              control={form.control}
              name="hoursPerWeek"
              label={t('subject.hoursPerWeek')}
              required
              min={0}
            />
            <NumberField
              control={form.control}
              name="passingPercentage"
              label={t('subject.passingPercentage')}
              description={t('subject.passingHint')}
              min={0}
              max={100}
            />
            <TextField
              control={form.control}
              name="strands"
              label={t('subject.strands')}
              description={t('subject.strandsHint')}
              className="sm:col-span-2"
            />
          </FieldSection>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={
          dialogs.deleteTarget
            ? `${dialogs.deleteTarget.code} — ${localizedName(dialogs.deleteTarget, i18n.language)}`
            : undefined
        }
        isPending={remove.isPending}
        onConfirm={() => {
          if (!dialogs.deleteTarget) return;
          void remove.mutateAsync(dialogs.deleteTarget.id).finally(dialogs.cancelDelete);
        }}
      />
    </div>
  );
}
