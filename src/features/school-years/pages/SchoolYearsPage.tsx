import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarCheck, Lock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCan } from '@/features/auth/hooks';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { stripEmpty } from '@/lib/payload';
import { formatDate, localizedName, toDateInput } from '@/lib/utils';
import {
  endAfterStart,
  endAfterStartIssue,
  optionalText,
  requiredDate,
  requiredText,
} from '@/lib/zod-helpers';
import type { SchoolYear } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { DateField, FieldSection, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import {
  schoolYears,
  useActivateSchoolYear,
  useCloseSchoolYear,
  type SchoolYearInput,
} from '../api';

const schema = z
  .object({
    code: requiredText(30),
    nameLo: requiredText(100),
    nameEn: optionalText(100),
    startDate: requiredDate(),
    endDate: requiredDate(),
  })
  .refine(endAfterStart, endAfterStartIssue);

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { code: '', nameLo: '', nameEn: '', startDate: '', endDate: '' };

export function SchoolYearsPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const table = useTableQueryState({ defaultSortBy: 'startDate', defaultSortOrder: 'desc' });
  const dialogs = useCrudDialogs<SchoolYear>();

  /** Activate and close are separate confirmations from delete. */
  const [pendingAction, setPendingAction] = useState<{
    kind: 'activate' | 'close';
    year: SchoolYear;
  } | null>(null);

  const list = schoolYears.useList(table.queryParams);
  const create = schoolYears.useCreate();
  const update = schoolYears.useUpdate();
  const remove = schoolYears.useDelete();
  const activate = useActivateSchoolYear();
  const close = useCloseSchoolYear();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!dialogs.formOpen) return;
    form.reset(
      dialogs.record
        ? {
            code: dialogs.record.code,
            nameLo: dialogs.record.nameLo,
            nameEn: dialogs.record.nameEn ?? '',
            startDate: toDateInput(dialogs.record.startDate),
            endDate: toDateInput(dialogs.record.endDate),
          }
        : EMPTY,
    );
  }, [dialogs.formOpen, dialogs.record, form]);

  const columns = useMemo<ColumnDef<SchoolYear, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('common.code'),
        cell: ({ row }) => (
          <span className="flex items-center gap-2 font-medium">
            {row.original.code}
            {row.original.isActive && <Badge variant="success">{t('schoolYear.isActive')}</Badge>}
          </span>
        ),
        meta: { sortKey: 'code' } satisfies DataTableColumnMeta,
      },
      {
        id: 'name',
        header: t('common.name'),
        cell: ({ row }) => localizedName(row.original, i18n.language),
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
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: t('common.edit'),
                icon: Pencil,
                hidden: !can('school-years', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('schoolYear.activate'),
                icon: CalendarCheck,
                hidden: !can('school-years', 'update') || row.original.isActive,
                onSelect: () => setPendingAction({ kind: 'activate', year: row.original }),
              },
              {
                label: t('schoolYear.close'),
                icon: Lock,
                destructive: true,
                hidden: !can('school-years', 'update'),
                onSelect: () => setPendingAction({ kind: 'close', year: row.original }),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('school-years', 'delete'),
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
    // `code` is fixed at creation — the API's update DTO does not accept it, and
    // it rejects unknown properties rather than ignoring them, so sending the
    // whole form back fails the save outright.
    const { code: _code, ...updatable } = values;

    const mutation = dialogs.record
      ? update.mutateAsync({ id: dialogs.record.id, body: stripEmpty(updatable) })
      : create.mutateAsync(stripEmpty(values) as SchoolYearInput);
    void mutation.then(dialogs.closeForm).catch(() => {});
  }

  const actionName = pendingAction ? localizedName(pendingAction.year, i18n.language) : '';

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('schoolYear.title')}
        actions={
          can('school-years', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('schoolYear.create')}
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
            <SearchInput value={table.search ?? ''} onChange={table.setSearch} className="w-full sm:w-64" />
          </TableToolbar>
        }
      />

      <FormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        title={dialogs.isEditing ? t('schoolYear.edit') : t('schoolYear.create')}
        onSubmit={form.handleSubmit(submit)}
        isSubmitting={create.isPending || update.isPending}
      >
        <Form {...form}>
          <FieldSection>
            <TextField
              control={form.control}
              name="code"
              label={t('common.code')}
              required
              // Fixed once the year exists — teacher codes and every record
              // filed against the year are derived from it.
              disabled={dialogs.isEditing}
              placeholder="2025-2026"
            />
            <TextField control={form.control} name="nameLo" label={t('common.nameLo')} required />
            <TextField control={form.control} name="nameEn" label={t('common.nameEn')} />
            <div className="hidden sm:block" />
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
        open={pendingAction !== null}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={
          pendingAction?.kind === 'activate' ? t('schoolYear.activate') : t('schoolYear.close')
        }
        description={
          pendingAction?.kind === 'activate'
            ? t('schoolYear.activateConfirm', { name: actionName })
            : t('schoolYear.closeConfirm', { name: actionName })
        }
        tone={pendingAction?.kind === 'activate' ? 'default' : 'danger'}
        isPending={activate.isPending || close.isPending}
        onConfirm={() => {
          if (!pendingAction) return;
          const run =
            pendingAction.kind === 'activate'
              ? activate.mutateAsync(pendingAction.year.id)
              : close.mutateAsync(pendingAction.year.id);
          void run.finally(() => setPendingAction(null));
        }}
      />
    </div>
  );
}
