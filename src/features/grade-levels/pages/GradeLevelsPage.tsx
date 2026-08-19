import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCan } from '@/features/auth/hooks';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { formatDate, localizedName } from '@/lib/utils';
import { stripEmpty } from '@/lib/payload';
import { optionalText, requiredNumber, requiredText } from '@/lib/zod-helpers';
import type { GradeLevel } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { CheckboxField, FieldSection, NumberField, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { BooleanBadge } from '@/components/common/StatusBadge';
import { SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { gradeLevels, type GradeLevelInput } from '../api';

const schema = z.object({
  code: requiredText(20),
  nameLo: requiredText(100),
  nameEn: optionalText(100),
  level: requiredNumber({ min: 1, integer: true }),
  isExitLevel: z.boolean().optional(),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { code: '', nameLo: '', nameEn: '', level: 1, isExitLevel: false };

export function GradeLevelsPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const table = useTableQueryState({ defaultSortBy: 'level', defaultSortOrder: 'asc' });
  const dialogs = useCrudDialogs<GradeLevel>();

  const list = gradeLevels.useList(table.queryParams);
  const create = gradeLevels.useCreate();
  const update = gradeLevels.useUpdate();
  const remove = gradeLevels.useDelete();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!dialogs.formOpen) return;
    form.reset(
      dialogs.record
        ? {
            code: dialogs.record.code,
            nameLo: dialogs.record.nameLo,
            nameEn: dialogs.record.nameEn ?? '',
            level: dialogs.record.level,
            isExitLevel: dialogs.record.isExitLevel,
          }
        : EMPTY,
    );
  }, [dialogs.formOpen, dialogs.record, form]);

  const columns = useMemo<ColumnDef<GradeLevel, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('common.code'),
        cell: ({ row }) => <span className="font-medium">{row.original.code}</span>,
        meta: { sortKey: 'code' } satisfies DataTableColumnMeta,
      },
      {
        id: 'name',
        header: t('gradeLevel.title'),
        cell: ({ row }) => localizedName(row.original, i18n.language),
      },
      {
        accessorKey: 'level',
        header: t('gradeLevel.level'),
        cell: ({ row }) => row.original.level,
        meta: { sortKey: 'level', className: 'w-24' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'isExitLevel',
        header: t('gradeLevel.isExitLevel'),
        cell: ({ row }) => <BooleanBadge value={row.original.isExitLevel} />,
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'createdAt',
        header: t('common.createdAt'),
        cell: ({ row }) => formatDate(row.original.createdAt),
        meta: { sortKey: 'createdAt', hideOnMobile: true } satisfies DataTableColumnMeta,
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
                hidden: !can('grade-levels', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('grade-levels', 'delete'),
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
      : create.mutateAsync(stripEmpty(values) as GradeLevelInput);
    void mutation.then(dialogs.closeForm).catch(() => {
      /* the global handler toasts; the form stays open with the values intact */
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('gradeLevel.title')}
        description={t('gradeLevel.levelHint')}
        actions={
          can('grade-levels', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('gradeLevel.create')}
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
        emptyTitle={table.hasActiveFilters ? t('common.noResults') : t('common.noData')}
        toolbar={
          <TableToolbar hasActiveFilters={table.hasActiveFilters} onClearFilters={table.clearFilters}>
            <SearchInput value={table.search ?? ''} onChange={table.setSearch} className="w-full sm:w-64" />
          </TableToolbar>
        }
      />

      <FormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        title={dialogs.isEditing ? t('gradeLevel.edit') : t('gradeLevel.create')}
        onSubmit={form.handleSubmit(submit)}
        isSubmitting={create.isPending || update.isPending}
      >
        <Form {...form}>
          <FieldSection>
            {/* Fixed once the level exists — subjects and classrooms are filed
                under this code. */}
            <TextField
              control={form.control}
              name="code"
              label={t('common.code')}
              required
              disabled={dialogs.isEditing}
              placeholder="m4"
            />
            <NumberField
              control={form.control}
              name="level"
              label={t('gradeLevel.level')}
              description={t('gradeLevel.levelHint')}
              required
              min={1}
            />
            <TextField control={form.control} name="nameLo" label={t('common.nameLo')} required />
            <TextField control={form.control} name="nameEn" label={t('common.nameEn')} />
            <CheckboxField
              control={form.control}
              name="isExitLevel"
              label={t('gradeLevel.isExitLevel')}
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
            ? `${localizedName(dialogs.deleteTarget, i18n.language)} (${dialogs.deleteTarget.code})`
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
