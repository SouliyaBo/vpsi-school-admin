import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronRight, List, MapPin, Network, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCan } from '@/features/auth/hooks';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { vmsg } from '@/lib/form-message';
import { stripEmpty } from '@/lib/payload';
import { cn, localizedName, refId } from '@/lib/utils';
import { optionalId, optionalText, requiredText } from '@/lib/zod-helpers';
import { LOCATION_TYPES, type LocationType } from '@/types/enums';
import type { Location, LocationTreeNode } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Form } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { FieldSection, SelectField, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { locations, useLocationOptions, useLocationTree, type LocationInput } from '../api';

const schema = z
  .object({
    nameLo: requiredText(150),
    nameEn: optionalText(150),
    code: optionalText(30),
    type: z.enum(LOCATION_TYPES),
    parentId: optionalId(),
  })
  // A province sits at the root; a district needs a province and a village needs
  // a district. The API rejects a mismatch, so the form states the rule up front.
  .refine((values) => values.type === 'province' || Boolean(values.parentId), {
    path: ['parentId'],
    message: vmsg('location.parentRequired'),
  });

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { nameLo: '', nameEn: '', code: '', type: 'province', parentId: '' };

export function LocationsPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const table = useTableQueryState({
    defaultSortBy: 'nameLo',
    defaultSortOrder: 'asc',
    filterKeys: ['type', 'parentId'],
  });
  const dialogs = useCrudDialogs<Location>();

  const tree = useLocationTree();
  const list = locations.useList(table.queryParams);
  const create = locations.useCreate();
  const update = locations.useUpdate();
  const remove = locations.useDelete();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  const selectedType = form.watch('type');

  useEffect(() => {
    if (!dialogs.formOpen) return;
    form.reset(
      dialogs.record
        ? {
            nameLo: dialogs.record.nameLo,
            nameEn: dialogs.record.nameEn ?? '',
            code: dialogs.record.code ?? '',
            type: dialogs.record.type,
            parentId: refId(dialogs.record.parentId) ?? '',
          }
        : EMPTY,
    );
  }, [dialogs.formOpen, dialogs.record, form]);

  /** Opens the form pre-set to create a child of `parent`. */
  function openChildForm(parent: Location, type: LocationType) {
    dialogs.openCreate();
    // `openCreate` clears the record, so the defaults are applied afterwards.
    setTimeout(() => form.reset({ ...EMPTY, type, parentId: parent.id }), 0);
  }

  const useParentOptions = (search: string) =>
    useLocationOptions(selectedType === 'village' ? 'district' : 'province', search);

  const columns = useMemo<ColumnDef<Location, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('common.name'),
        cell: ({ row }) => (
          <span className="font-medium">{localizedName(row.original, i18n.language)}</span>
        ),
        meta: { sortKey: 'nameLo' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'type',
        header: t('location.type'),
        cell: ({ row }) => <StatusBadge status={row.original.type} namespace="locationType" />,
      },
      {
        accessorKey: 'code',
        header: t('common.code'),
        cell: ({ row }) => row.original.code ?? '—',
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'depth',
        header: t('location.parent'),
        cell: ({ row }) => {
          const parent = row.original.parentId;
          if (!parent) return '—';
          return typeof parent === 'string' ? '—' : localizedName(parent, i18n.language);
        },
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
                hidden: !can('locations', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('locations', 'delete'),
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
    // A location's `type` is fixed at creation — the API's update DTO does not
    // accept it, and it rejects unknown properties rather than ignoring them, so
    // sending the whole form back fails the save outright.
    const { type: _type, ...updatable } = values;

    const mutation = dialogs.record
      ? update.mutateAsync({ id: dialogs.record.id, body: stripEmpty(updatable) })
      : create.mutateAsync(stripEmpty(values) as LocationInput);
    void mutation.then(dialogs.closeForm).catch(() => {});
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('location.title')}
        actions={
          can('locations', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('location.create')}
            </Button>
          )
        }
      />

      <Tabs defaultValue="tree">
        <TabsList>
          <TabsTrigger value="tree">
            <Network />
            {t('location.treeView')}
          </TabsTrigger>
          <TabsTrigger value="list">
            <List />
            {t('location.listView')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tree">
          <Card>
            <CardContent className="pt-5">
              {tree.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }, (_, index) => (
                    <Skeleton key={index} className="h-8 w-full" />
                  ))}
                </div>
              ) : tree.error ? (
                <ErrorState error={tree.error} onRetry={tree.refetch} compact />
              ) : !tree.data?.length ? (
                <EmptyState
                  icon={MapPin}
                  title={t('common.noData')}
                  action={
                    can('locations', 'create') && (
                      <Button size="sm" onClick={dialogs.openCreate}>
                        <Plus />
                        {t('location.addProvince')}
                      </Button>
                    )
                  }
                />
              ) : (
                <ul className="space-y-0.5">
                  {tree.data.map((node) => (
                    <TreeRow
                      key={node.id}
                      node={node}
                      level={0}
                      onEdit={dialogs.openEdit}
                      onDelete={dialogs.askDelete}
                      onAddChild={openChildForm}
                      canUpdate={can('locations', 'update')}
                      canDelete={can('locations', 'delete')}
                      canCreate={can('locations', 'create')}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="list">
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
                  className="w-full sm:w-64"
                />
                <FilterSelect
                  value={table.filters.type}
                  onChange={(value) => table.setFilter('type', value)}
                  options={LOCATION_TYPES.map((type) => ({
                    value: type,
                    label: t(`locationType.${type}`),
                  }))}
                  placeholder={t('location.type')}
                />
              </TableToolbar>
            }
          />
        </TabsContent>
      </Tabs>

      <FormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        title={dialogs.isEditing ? t('location.edit') : t('location.create')}
        onSubmit={form.handleSubmit(submit)}
        isSubmitting={create.isPending || update.isPending}
      >
        <Form {...form}>
          <FieldSection>
            <SelectField
              control={form.control}
              name="type"
              label={t('location.type')}
              required
              // Fixed once it exists: a village cannot become a district without
              // rewriting the ancestry of everything beneath it.
              disabled={dialogs.isEditing}
              options={LOCATION_TYPES.map((type) => ({
                value: type,
                label: t(`locationType.${type}`),
              }))}
            />
            <TextField control={form.control} name="code" label={t('common.code')} />
            <TextField control={form.control} name="nameLo" label={t('common.nameLo')} required />
            <TextField control={form.control} name="nameEn" label={t('common.nameEn')} />
            {selectedType !== 'province' && (
              <EntitySelectField
                control={form.control}
                name="parentId"
                label={t('location.parent')}
                required
                useOptions={useParentOptions}
                className="sm:col-span-2"
              />
            )}
          </FieldSection>
        </Form>
      </FormDialog>

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={
          dialogs.deleteTarget
            ? t('location.deleteConfirm', {
                name: localizedName(dialogs.deleteTarget, i18n.language),
              })
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

interface TreeRowProps {
  node: LocationTreeNode;
  level: number;
  onEdit: (location: Location) => void;
  onDelete: (location: Location) => void;
  onAddChild: (parent: Location, type: LocationType) => void;
  canUpdate: boolean;
  canDelete: boolean;
  canCreate: boolean;
}

/**
 * One node of the province → district → village tree.
 *
 * Collapsed by default below the top level: a province with sixty districts,
 * each holding dozens of villages, is unusable expanded.
 */
function TreeRow({ node, level, onEdit, onDelete, onAddChild, canUpdate, canDelete, canCreate }: TreeRowProps) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(level === 0);
  const children = node.children ?? [];
  const hasChildren = children.length > 0;

  const childType: LocationType | null =
    node.type === 'province' ? 'district' : node.type === 'district' ? 'village' : null;

  return (
    <li>
      <div
        className="group flex items-center gap-1 rounded-md py-1 pe-1 hover:bg-accent"
        style={{ paddingInlineStart: `${level * 1.25}rem` }}
      >
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          disabled={!hasChildren}
          aria-label={open ? t('common.close') : t('common.view')}
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground disabled:opacity-0"
        >
          <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
        </button>

        <span className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">{localizedName(node, i18n.language)}</span>
          {node.code && <span className="ms-2 text-xs text-muted-foreground">{node.code}</span>}
          {hasChildren && (
            <span className="ms-2 text-xs text-muted-foreground">({children.length})</span>
          )}
        </span>

        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          {canCreate && childType && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t(`location.add${childType === 'district' ? 'District' : 'Village'}`)}
              onClick={() => onAddChild(node, childType)}
            >
              <Plus />
            </Button>
          )}
          {canUpdate && (
            <Button variant="ghost" size="icon-sm" aria-label={t('common.edit')} onClick={() => onEdit(node)}>
              <Pencil />
            </Button>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-danger"
              aria-label={t('common.delete')}
              onClick={() => onDelete(node)}
            >
              <Trash2 />
            </Button>
          )}
        </div>
      </div>

      {open && hasChildren && (
        <ul className="space-y-0.5">
          {children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              level={level + 1}
              onEdit={onEdit}
              onDelete={onDelete}
              onAddChild={onAddChild}
              canUpdate={canUpdate}
              canDelete={canDelete}
              canCreate={canCreate}
            />
          ))}
        </ul>
      )}
    </li>
  );
}
