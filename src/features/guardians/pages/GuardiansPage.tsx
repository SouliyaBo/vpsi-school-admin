import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useCan } from '@/features/auth/hooks';
import { useClassroomOptions } from '@/features/classrooms/api';
import { qualifyClassName } from '@/features/homeroom-reviews/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { formatDate, fullName, localizedName, refId, refObject } from '@/lib/utils';
import { CURRENT_ROLL_STUDENT_STATUSES } from '@/types/enums';
import type { Guardian, GuardianChild, Location } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { DetailDrawer, DetailRow, DetailSection } from '@/components/common/DetailDrawer';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { guardians, useGuardianChildren } from '../api';
import { GuardianFormDialog } from '../components/GuardianFormDialog';

export function GuardiansPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  // `classroomId` is resolved by the API through the children's enrollments.
  const table = useTableQueryState({
    defaultSortBy: 'lastNameLo',
    defaultSortOrder: 'asc',
    filterKeys: ['classroomId'],
  });
  const classroomOptions = useClassroomOptions();
  const dialogs = useCrudDialogs<Guardian>();
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = guardians.useList(table.queryParams);
  const remove = guardians.useDelete();
  const detail = guardians.useDetail(detailId ?? undefined);
  const children = useGuardianChildren(detailId ?? undefined);

  const columns = useMemo<ColumnDef<Guardian, unknown>[]>(
    () => [
      {
        id: 'name',
        header: t('person.fullName'),
        cell: ({ row }) => (
          <span className="font-medium">{fullName(row.original, i18n.language)}</span>
        ),
        meta: { sortKey: 'lastNameLo' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'phone',
        header: t('person.phone'),
        cell: ({ row }) => (
          <div>
            <p>{row.original.phone}</p>
            {row.original.alternatePhone && (
              <p className="text-xs text-muted-foreground">{row.original.alternatePhone}</p>
            )}
          </div>
        ),
      },
      {
        id: 'children',
        header: t('guardian.childrenColumn'),
        // Who the guardian is *for* is what staff look them up by, so it stays
        // visible on a phone too.
        cell: ({ row }) => <ChildrenCell children={row.original.children ?? []} />,
      },
      {
        accessorKey: 'occupation',
        header: t('guardian.occupation'),
        cell: ({ row }) => row.original.occupation ?? '—',
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'email',
        header: t('person.email'),
        cell: ({ row }) => row.original.email ?? '—',
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
              { label: t('common.details'), icon: Eye, onSelect: () => setDetailId(row.original.id) },
              {
                label: t('common.edit'),
                icon: Pencil,
                hidden: !can('guardians', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('guardians', 'delete'),
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

  const current = detail.data;
  const village = refObject<Location>(current?.villageId);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('guardian.title')}
        actions={
          can('guardians', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('guardian.create')}
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
        onRowClick={(row) => setDetailId(row.id)}
        getRowId={(row) => row.id}
        toolbar={
          <TableToolbar hasActiveFilters={table.hasActiveFilters} onClearFilters={table.clearFilters}>
            <SearchInput
              value={table.search ?? ''}
              onChange={table.setSearch}
              placeholder={t('guardian.searchHint')}
              className="w-full sm:w-80"
            />
            <FilterSelect
              value={table.filters.classroomId}
              onChange={(value) => table.setFilter('classroomId', value)}
              options={classroomOptions.data ?? []}
              placeholder={t('classroom.title')}
            />
          </TableToolbar>
        }
      />

      <GuardianFormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        guardian={dialogs.record}
      />

      <DetailDrawer
        open={detailId !== null}
        onOpenChange={(open) => !open && setDetailId(null)}
        title={current ? fullName(current, i18n.language) : t('common.details')}
        description={current?.phone}
        isLoading={detail.isLoading}
        error={detail.error}
        onRetry={detail.refetch}
        footer={
          current &&
          can('guardians', 'update') && (
            <Button
              onClick={() => {
                dialogs.openEdit(current);
                setDetailId(null);
              }}
            >
              <Pencil />
              {t('common.edit')}
            </Button>
          )
        }
      >
        {current && (
          <div className="space-y-6">
            <DetailSection title={t('person.basicInfo')}>
              <DetailRow label={t('person.gender')}>
                {current.gender ? t(`gender.${current.gender}`) : '—'}
              </DetailRow>
              <DetailRow label={t('person.dateOfBirth')}>{formatDate(current.dateOfBirth)}</DetailRow>
              <DetailRow label={t('person.nationalId')}>{current.nationalId ?? '—'}</DetailRow>
            </DetailSection>

            <DetailSection title={t('person.contactInfo')}>
              <DetailRow label={t('person.phone')}>{current.phone}</DetailRow>
              <DetailRow label={t('guardian.alternatePhone')}>{current.alternatePhone ?? '—'}</DetailRow>
              <DetailRow label={t('person.email')}>{current.email ?? '—'}</DetailRow>
            </DetailSection>

            <DetailSection title={t('person.workInfo')}>
              <DetailRow label={t('guardian.occupation')}>{current.occupation ?? '—'}</DetailRow>
              <DetailRow label={t('guardian.workplace')}>{current.workplace ?? '—'}</DetailRow>
            </DetailSection>

            <DetailSection title={t('person.addressInfo')}>
              <DetailRow label={t('person.village')}>
                {village ? localizedName(village, i18n.language) : '—'}
              </DetailRow>
              <DetailRow label={t('person.addressDetail')}>{current.addressDetail ?? '—'}</DetailRow>
            </DetailSection>

            {/* Children come from a separate endpoint; the relationship itself is
                edited from the student side, which owns the guardian list. */}
            <section className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('guardian.children')}
              </h3>
              {children.data?.length ? (
                <ul className="divide-y divide-border rounded-md border border-border">
                  {children.data.map((student) => {
                    const link = student.guardians?.find(
                      (entry) => refId(entry.guardianId) === current.id,
                    );
                    return (
                      <li key={student.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <div className="min-w-0">
                          <Link
                            to={`/students/${student.id}`}
                            className="truncate font-medium hover:underline"
                          >
                            {fullName(student, i18n.language)}
                          </Link>
                          <p className="text-xs text-muted-foreground">{student.studentCode}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {link && (
                            <span className="text-xs text-muted-foreground">
                              {t(`relationship.${link.relationship}`)}
                            </span>
                          )}
                          <StatusBadge status={student.status} namespace="studentStatus" />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <EmptyState
                  icon={Users}
                  title={t('guardian.noChildren')}
                  className="rounded-md border border-dashed border-border py-8"
                />
              )}
            </section>
          </div>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={
          dialogs.deleteTarget
            ? t('guardian.deleteConfirm', { name: fullName(dialogs.deleteTarget, i18n.language) })
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

/**
 * One line per child: name (nickname) · room · relationship.
 *
 * A child with no room this year is shown as unplaced while still on the roll,
 * and by status once they have left — so a graduate's parent does not read as a
 * current class contact.
 */
function ChildrenCell({ children }: { children: GuardianChild[] }) {
  const { t } = useTranslation();
  if (children.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <ul className="space-y-1">
      {children.map((child) => {
        const onRoll = (CURRENT_ROLL_STUDENT_STATUSES as readonly string[]).includes(child.status);
        return (
          <li key={child.id} className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
            <Link
              to={`/students/${child.id}`}
              className="font-medium hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {child.firstNameLo} {child.lastNameLo}
              {child.nickname && ` (${child.nickname})`}
            </Link>
            <span className="text-muted-foreground">·</span>
            {child.classroomName ? (
              <span>{qualifyClassName(child.classroomName, child.gradeLevelCode)}</span>
            ) : onRoll ? (
              <Badge variant="warning">{t('enrollment.noClassroom')}</Badge>
            ) : (
              <StatusBadge status={child.status} namespace="studentStatus" />
            )}
            <span className="text-xs text-muted-foreground">
              {t(`relationship.${child.relationship}`)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
