import { zodResolver } from '@hookform/resolvers/zod';
import type { ColumnDef } from '@tanstack/react-table';
import { Copy, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useCan } from '@/features/auth/hooks';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { vmsg } from '@/lib/form-message';
import { stripEmpty } from '@/lib/payload';
import { localizedName } from '@/lib/utils';
import { optionalText, requiredText } from '@/lib/zod-helpers';
import type { Role } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { DetailDrawer, DetailRow } from '@/components/common/DetailDrawer';
import { FieldSection, TextField, TextareaField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { PermissionMatrixEditor } from '../components/PermissionMatrixEditor';
import { PermissionSummary } from '../components/PermissionSummary';
import {
  fromMatrix,
  grantedResourceCount,
  isFullAccess,
  toMatrix,
  type PermissionMatrix,
} from '../permission-matrix';
import { roles, type RoleInput } from '../api';

const schema = z.object({
  code: requiredText(50).regex(/^[a-z0-9_]+$/, vmsg('role.codeRule')),
  nameLo: requiredText(100),
  nameEn: requiredText(100),
  description: optionalText(500),
});
type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = { code: '', nameLo: '', nameEn: '', description: '' };

/**
 * Where authority is defined — the matrix the API enforces on every request.
 *
 * The seven seeded roles are `isSystem`, and the API refuses to change their
 * permissions or delete them: locking the office out of `admin` has no recovery
 * path short of a database edit. Their names stay editable, and the grid is shown
 * read-only, because "what may the registrar do?" is the question this page is
 * opened for far more often than "give someone new powers".
 */
export function RolesPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const table = useTableQueryState({ defaultSortBy: 'code', defaultSortOrder: 'asc' });
  const dialogs = useCrudDialogs<Role>();
  const [viewing, setViewing] = useState<Role | null>(null);

  const list = roles.useList(table.queryParams);
  const create = roles.useCreate();
  const update = roles.useUpdate();
  const remove = roles.useDelete();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });
  // The grid is held outside react-hook-form: it carries no per-field validation
  // and no error message, and a record of arrays is not what RHF is good at.
  const [matrix, setMatrix] = useState<PermissionMatrix>({});

  const editingSystemRole = dialogs.record?.isSystem ?? false;

  useEffect(() => {
    if (!dialogs.formOpen) return;
    form.reset(
      dialogs.record
        ? {
            code: dialogs.record.code,
            nameLo: dialogs.record.nameLo,
            nameEn: dialogs.record.nameEn,
            description: dialogs.record.description ?? '',
          }
        : EMPTY,
    );
    setMatrix(toMatrix(dialogs.record?.permissions));
  }, [dialogs.formOpen, dialogs.record, form]);

  // Copying an existing matrix is how a new role actually gets built: "the
  // registrar, but without exam registration" is a two-click start rather than
  // thirty-two rows of clicking.
  const copySources = (list.data?.data ?? []).filter((role) => role.id !== dialogs.record?.id);

  const columns = useMemo<ColumnDef<Role, unknown>[]>(
    () => [
      {
        accessorKey: 'code',
        header: t('common.code'),
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span>,
        meta: { sortKey: 'code' } satisfies DataTableColumnMeta,
      },
      {
        id: 'name',
        header: t('common.name'),
        cell: ({ row }) => (
          <span className="font-medium">{localizedName(row.original, i18n.language)}</span>
        ),
        meta: { sortKey: 'nameLo' } satisfies DataTableColumnMeta,
      },
      {
        id: 'access',
        header: t('role.access'),
        cell: ({ row }) =>
          isFullAccess(row.original.permissions) ? (
            <Badge variant="warning">{t('role.fullAccess')}</Badge>
          ) : (
            <span className="text-muted-foreground">
              {t('role.resourceCount', { n: grantedResourceCount(row.original.permissions) })}
            </span>
          ),
      },
      {
        id: 'kind',
        header: t('role.kind'),
        cell: ({ row }) => (
          <Badge variant={row.original.isSystem ? 'secondary' : 'outline'}>
            {t(row.original.isSystem ? 'role.system' : 'role.custom')}
          </Badge>
        ),
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: t('role.viewPermissions'),
                icon: Eye,
                onSelect: () => setViewing(row.original),
              },
              {
                label: t('common.edit'),
                icon: Pencil,
                hidden: !can('roles', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                // The API refuses either way; hiding it keeps the menu honest
                // about what a seeded role allows.
                hidden: !can('roles', 'delete') || row.original.isSystem,
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
    const permissions = fromMatrix(matrix);

    const mutation = dialogs.record
      ? update.mutateAsync({
          id: dialogs.record.id,
          body: {
            nameLo: values.nameLo,
            nameEn: values.nameEn,
            // Passed through rather than stripped: `''` is how a description is
            // cleared, and the API's `@IsOptional()` accepts an empty string.
            description: values.description ?? '',
            // `RolesService.update` rejects the key outright for a system role,
            // so it is left off rather than sent unchanged.
            ...(editingSystemRole ? {} : { permissions }),
          },
        })
      : create.mutateAsync({
          ...(stripEmpty(values) as Omit<RoleInput, 'permissions'>),
          permissions,
        });

    void mutation.then(dialogs.closeForm).catch(() => {
      /* the global handler toasts; the form stays open with the values intact */
    });
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('role.title')}
        description={t('role.subtitle')}
        actions={
          can('roles', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('role.create')}
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
        onRowClick={setViewing}
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
        title={dialogs.isEditing ? t('role.edit') : t('role.create')}
        description={editingSystemRole ? t('role.systemHint') : t('role.createHint')}
        size="xl"
        onSubmit={form.handleSubmit(submit)}
        isSubmitting={create.isPending || update.isPending}
      >
        <Form {...form}>
          <FieldSection>
            <TextField
              control={form.control}
              name="code"
              label={t('common.code')}
              description={t('role.codeHint')}
              required
              // Fixed after creation: accounts reference the role by id, but the
              // code is what the seeds and `findByCode` key on.
              disabled={dialogs.isEditing}
              placeholder="homeroom_teacher"
            />
            <TextField control={form.control} name="nameLo" label={t('common.nameLo')} required />
            <TextField control={form.control} name="nameEn" label={t('common.nameEn')} required />
            <TextareaField
              control={form.control}
              name="description"
              label={t('common.description')}
              className="sm:col-span-2"
            />
          </FieldSection>

          <div className="mt-4 space-y-2">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Label>{t('role.permissions')}</Label>
                <p className="text-xs text-muted-foreground">
                  {editingSystemRole ? t('role.systemPermissionsFixed') : t('role.permissionsHint')}
                </p>
              </div>

              {!editingSystemRole && copySources.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Copy className="size-3.5 text-muted-foreground" />
                  <Select
                    // Kept uncontrolled-by-value: this is an action, not a field
                    // — picking `registrar` twice should copy twice.
                    value=""
                    onValueChange={(id) => {
                      const source = copySources.find((role) => role.id === id);
                      if (source) setMatrix(toMatrix(source.permissions));
                    }}
                  >
                    <SelectTrigger
                      aria-label={t('role.copyFrom')}
                      className="h-8 w-auto min-w-44 text-xs"
                    >
                      <SelectValue placeholder={t('role.copyFrom')} />
                    </SelectTrigger>
                    <SelectContent>
                      {copySources.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {localizedName(role, i18n.language)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <PermissionMatrixEditor
              value={matrix}
              onChange={setMatrix}
              disabled={editingSystemRole}
            />
          </div>
        </Form>
      </FormDialog>

      <DetailDrawer
        open={viewing !== null}
        onOpenChange={(open) => !open && setViewing(null)}
        title={viewing ? localizedName(viewing, i18n.language) : ''}
        description={viewing?.code}
        footer={
          viewing &&
          can('roles', 'update') && (
            <Button
              variant="outline"
              onClick={() => {
                dialogs.openEdit(viewing);
                setViewing(null);
              }}
            >
              <Pencil />
              {t('common.edit')}
            </Button>
          )
        }
      >
        {viewing && (
          <div className="space-y-5">
            <div>
              <DetailRow label={t('role.kind')}>
                <Badge variant={viewing.isSystem ? 'secondary' : 'outline'}>
                  {t(viewing.isSystem ? 'role.system' : 'role.custom')}
                </Badge>
              </DetailRow>
              <DetailRow label={t('role.access')}>
                {isFullAccess(viewing.permissions)
                  ? t('role.fullAccess')
                  : t('role.resourceCount', { n: grantedResourceCount(viewing.permissions) })}
              </DetailRow>
              {viewing.description && (
                <DetailRow label={t('common.description')}>{viewing.description}</DetailRow>
              )}
            </div>

            <PermissionSummary permissions={viewing.permissions} />
          </div>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={
          dialogs.deleteTarget
            ? t('role.deleteConfirm', {
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
