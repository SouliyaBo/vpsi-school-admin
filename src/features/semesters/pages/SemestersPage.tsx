import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarCheck, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCan } from '@/features/auth/hooks';
import { useSchoolYearOptions } from '@/features/school-years/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { stripEmpty } from '@/lib/payload';
import { formatDate, localizedName, refId, refObject, toDateInput } from '@/lib/utils';
import {
  endAfterStart,
  endAfterStartIssue,
  optionalText,
  requiredDate,
  requiredId,
  requiredNumber,
  requiredText,
} from '@/lib/zod-helpers';
import { SEMESTER_STATUSES } from '@/types/enums';
import type { SchoolYear, Semester } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { DateField, FieldSection, NumberField, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { semesters, useActivateSemester, type SemesterInput } from '../api';

const schema = z
  .object({
    schoolYearId: requiredId(),
    number: requiredNumber({ min: 1, max: 4, integer: true }),
    nameLo: requiredText(100),
    nameEn: optionalText(100),
    startDate: requiredDate(),
    endDate: requiredDate(),
  })
  .refine(endAfterStart, endAfterStartIssue);

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  schoolYearId: '',
  number: 1,
  nameLo: '',
  nameEn: '',
  startDate: '',
  endDate: '',
};

export function SemestersPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const table = useTableQueryState({
    defaultSortBy: 'startDate',
    defaultSortOrder: 'desc',
    filterKeys: ['schoolYearId', 'status'],
  });
  const dialogs = useCrudDialogs<Semester>();
  const [activateTarget, setActivateTarget] = useState<Semester | null>(null);

  const list = semesters.useList(table.queryParams);
  const create = semesters.useCreate();
  const update = semesters.useUpdate();
  const remove = semesters.useDelete();
  const activate = useActivateSemester();

  // Also used to label the school-year filter, so the two never disagree.
  const yearOptions = useSchoolYearOptions();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!dialogs.formOpen) return;
    form.reset(
      dialogs.record
        ? {
            schoolYearId: refId(dialogs.record.schoolYearId) ?? '',
            number: dialogs.record.number,
            nameLo: dialogs.record.nameLo,
            nameEn: dialogs.record.nameEn ?? '',
            startDate: toDateInput(dialogs.record.startDate),
            endDate: toDateInput(dialogs.record.endDate),
          }
        : { ...EMPTY, schoolYearId: table.filters.schoolYearId ?? '' },
    );
    // `table.filters` is read only to pre-fill a new record from the active filter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogs.formOpen, dialogs.record, form]);

  const columns = useMemo<ColumnDef<Semester, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('common.name'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{localizedName(row.original, i18n.language)}</span>
            {row.original.isActive && <Badge variant="success">{t('schoolYear.isActive')}</Badge>}
          </span>
        ),
      },
      {
        accessorKey: 'number',
        header: t('semester.number'),
        cell: ({ row }) => row.original.number,
        meta: { sortKey: 'number', className: 'w-24' } satisfies DataTableColumnMeta,
      },
      {
        id: 'schoolYear',
        header: t('semester.schoolYear'),
        // Populated on detail responses; on the list it is an id, and the
        // school-year filter is the way to see the grouping.
        cell: ({ row }) => {
          const year = refObject<SchoolYear>(row.original.schoolYearId);
          return year ? localizedName(year, i18n.language) : '—';
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'startDate',
        header: t('schoolYear.startDate'),
        cell: ({ row }) => formatDate(row.original.startDate),
        meta: { sortKey: 'startDate' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'endDate',
        header: t('schoolYear.endDate'),
        cell: ({ row }) => formatDate(row.original.endDate),
        meta: { sortKey: 'endDate', hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'status',
        header: t('semester.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} namespace="semesterStatus" />,
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
                hidden: !can('semesters', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('semester.activate'),
                icon: CalendarCheck,
                hidden: !can('semesters', 'update') || row.original.isActive,
                onSelect: () => setActivateTarget(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('semesters', 'delete'),
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
    // A semester's year and number are fixed at creation — the API's update DTO
    // does not accept them, and it rejects unknown properties rather than
    // ignoring them, so sending the whole form back fails the save outright.
    const { schoolYearId: _year, number: _number, ...updatable } = values;

    const mutation = dialogs.record
      ? update.mutateAsync({ id: dialogs.record.id, body: stripEmpty(updatable) })
      : create.mutateAsync(stripEmpty(values) as SemesterInput);
    void mutation.then(dialogs.closeForm).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('semester.title')}
        actions={
          can('semesters', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('semester.create')}
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
              value={table.filters.status}
              onChange={(value) => table.setFilter('status', value)}
              options={SEMESTER_STATUSES.map((status) => ({
                value: status,
                label: t(`semesterStatus.${status}`),
              }))}
              placeholder={t('semester.status')}
            />
          </TableToolbar>
        }
      />

      <FormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        title={dialogs.isEditing ? t('semester.edit') : t('semester.create')}
        onSubmit={form.handleSubmit(submit)}
        isSubmitting={create.isPending || update.isPending}
      >
        <Form {...form}>
          <FieldSection>
            {/* Fixed once the semester exists: everything filed against it —
                scores, attendance, term results — is keyed by the pair. */}
            <EntitySelectField
              control={form.control}
              name="schoolYearId"
              label={t('semester.schoolYear')}
              required
              disabled={dialogs.isEditing}
              useOptions={useSchoolYearOptions}
            />
            <NumberField
              control={form.control}
              name="number"
              label={t('semester.number')}
              required
              disabled={dialogs.isEditing}
              min={1}
              max={4}
            />
            <TextField control={form.control} name="nameLo" label={t('common.nameLo')} required />
            <TextField control={form.control} name="nameEn" label={t('common.nameEn')} />
            <DateField control={form.control} name="startDate" label={t('schoolYear.startDate')} required />
            <DateField control={form.control} name="endDate" label={t('schoolYear.endDate')} required />
          </FieldSection>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={dialogs.deleteTarget ? localizedName(dialogs.deleteTarget, i18n.language) : undefined}
        isPending={remove.isPending}
        onConfirm={() => {
          if (!dialogs.deleteTarget) return;
          void remove.mutateAsync(dialogs.deleteTarget.id).finally(dialogs.cancelDelete);
        }}
      />

      <ConfirmDialog
        open={activateTarget !== null}
        onOpenChange={(open) => !open && setActivateTarget(null)}
        title={t('semester.activate')}
        description={activateTarget ? localizedName(activateTarget, i18n.language) : undefined}
        tone="default"
        isPending={activate.isPending}
        onConfirm={() => {
          if (!activateTarget) return;
          void activate.mutateAsync(activateTarget.id).finally(() => setActivateTarget(null));
        }}
      />
    </div>
  );
}
