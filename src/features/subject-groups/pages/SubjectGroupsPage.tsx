import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCan } from '@/features/auth/hooks';
import { useTeacherOptions } from '@/features/teachers/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { stripEmpty } from '@/lib/payload';
import { fullName, localizedName, refId, refObject } from '@/lib/utils';
import { optionalId, optionalText, requiredNumber, requiredText } from '@/lib/zod-helpers';
import type { SubjectGroup, Teacher } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { FieldSection, NumberField, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { BooleanBadge } from '@/components/common/StatusBadge';
import { SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { subjectGroups, type SubjectGroupInput } from '../api';

const schema = z.object({
  code: requiredText(30),
  nameLo: requiredText(120),
  nameEn: optionalText(120),
  headTeacherId: optionalId(),
  sortOrder: requiredNumber({ min: 1, integer: true }),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  code: '',
  nameLo: '',
  nameEn: '',
  headTeacherId: undefined,
  sortOrder: 1,
};

/**
 * Where the school's departments (`ສາຍວິຊາ`) are maintained.
 *
 * Small and rarely edited, but it is the axis the lesson-plan compliance matrix
 * groups by and the route a submission takes to a reviewer — so the head field
 * is the one that matters most on this page, not the name.
 */
export function SubjectGroupsPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const table = useTableQueryState({ defaultSortBy: 'sortOrder', defaultSortOrder: 'asc' });
  const dialogs = useCrudDialogs<SubjectGroup>();

  const list = subjectGroups.useList(table.queryParams);
  const create = subjectGroups.useCreate();
  const update = subjectGroups.useUpdate();
  const remove = subjectGroups.useDelete();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!dialogs.formOpen) return;
    form.reset(
      dialogs.record
        ? {
            code: dialogs.record.code,
            nameLo: dialogs.record.nameLo,
            nameEn: dialogs.record.nameEn ?? '',
            // `refId`, not `refObject`: the head must survive into the form
            // whether the row arrived populated or as a bare id — with it unset,
            // saving any other field would send `headTeacherId: null` and quietly
            // vacate the post.
            headTeacherId: refId<Teacher>(dialogs.record.headTeacherId) ?? undefined,
            sortOrder: dialogs.record.sortOrder,
          }
        : { ...EMPTY, sortOrder: (list.data?.meta.total ?? 0) + 1 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dialogs.formOpen, dialogs.record, form]);

  // The picker holds one page of teachers, so a sitting head need not be among
  // them — without a label of its own the trigger would read "…" for a head that
  // is in fact set. Dropped as soon as a different teacher is picked, since from
  // then on the option's own label is the accurate one.
  const selectedHeadId = form.watch('headTeacherId');
  const recordHead = refObject<Teacher>(dialogs.record?.headTeacherId);
  const headLabel =
    recordHead && selectedHeadId === recordHead.id
      ? `${recordHead.teacherCode} — ${fullName(recordHead, i18n.language)}`
      : undefined;

  const columns = useMemo<ColumnDef<SubjectGroup, unknown>[]>(
    () => [
      {
        accessorKey: 'sortOrder',
        header: '#',
        cell: ({ row }) => row.original.sortOrder,
        meta: { sortKey: 'sortOrder', className: 'w-12' } satisfies DataTableColumnMeta,
      },
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
        id: 'head',
        header: t('subjectGroup.head'),
        cell: ({ row }) => {
          const head = refObject<Teacher>(row.original.headTeacherId);
          return head ? (
            fullName(head, i18n.language)
          ) : (
            // A vacant post is worth pointing at: plan submissions for this
            // department fall back to notifying every academic head.
            <span className="text-warning">{t('subjectGroup.noHead')}</span>
          );
        },
      },
      {
        accessorKey: 'isActive',
        header: t('common.active'),
        cell: ({ row }) => <BooleanBadge value={row.original.isActive} />,
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
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
                hidden: !can('subject-groups', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('subject-groups', 'delete'),
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
    // `code` is fixed after creation: subjects and teachers are filed by id, but
    // the code is what appears on an exported report, and renaming it mid-year
    // makes two years of reports disagree about the same department.
    const { code: _code, ...updatable } = values;

    const mutation = dialogs.record
      ? update.mutateAsync({
          id: dialogs.record.id,
          // `stripEmpty` would drop a cleared head, so the null is passed through
          // explicitly — that is how a group is left vacant.
          body: { ...stripEmpty(updatable), headTeacherId: values.headTeacherId ?? null },
        })
      : create.mutateAsync(stripEmpty(values) as SubjectGroupInput);
    void mutation.then(dialogs.closeForm).catch(() => {
      /* the global handler toasts; the form stays open with the values intact */
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('subjectGroup.title')}
        description={t('subjectGroup.subtitle')}
        actions={
          can('subject-groups', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('subjectGroup.create')}
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
          <TableToolbar
            hasActiveFilters={table.hasActiveFilters}
            onClearFilters={table.clearFilters}
          >
            <SearchInput
              value={table.search ?? ''}
              onChange={table.setSearch}
              className="w-full sm:w-64"
            />
          </TableToolbar>
        }
      />

      <FormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        title={dialogs.isEditing ? t('subjectGroup.edit') : t('subjectGroup.create')}
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
              disabled={dialogs.isEditing}
              placeholder="science"
            />
            <NumberField
              control={form.control}
              name="sortOrder"
              label={t('subjectGroup.sortOrder')}
              required
              min={1}
            />
            <TextField control={form.control} name="nameLo" label={t('common.nameLo')} required />
            <TextField control={form.control} name="nameEn" label={t('common.nameEn')} />
            <EntitySelectField
              control={form.control}
              name="headTeacherId"
              label={t('subjectGroup.head')}
              description={t('subjectGroup.headHint')}
              useOptions={useTeacherOptions}
              selectedLabel={headLabel}
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
