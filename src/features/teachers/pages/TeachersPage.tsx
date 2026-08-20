import type { ColumnDef } from '@tanstack/react-table';
import { Eye, KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCan } from '@/features/auth/hooks';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { calculateAge, formatDate, fullName, initials, localizedName, refObject } from '@/lib/utils';
import { TEACHER_STATUSES } from '@/types/enums';
import type { Location, Teacher } from '@/types/entities';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { DetailDrawer, DetailRow, DetailSection } from '@/components/common/DetailDrawer';
import { FileUpload } from '@/components/common/FileUpload';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { TeacherFormDialog } from '../components/TeacherFormDialog';
import { teachers, useUploadTeacherPhoto } from '../api';

export function TeachersPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const navigate = useNavigate();
  const table = useTableQueryState({
    defaultSortBy: 'teacherCode',
    defaultSortOrder: 'asc',
    filterKeys: ['status', 'isAcademicHead'],
  });
  const dialogs = useCrudDialogs<Teacher>();

  /** Row opened in the detail drawer. */
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = teachers.useList(table.queryParams);
  const remove = teachers.useDelete();
  // The detail read is what carries `photoUrl` (a signed S3 URL) and the
  // populated village, neither of which the list projection includes.
  const detail = teachers.useDetail(detailId ?? undefined);
  const uploadPhoto = useUploadTeacherPhoto(detailId ?? undefined);

  const columns = useMemo<ColumnDef<Teacher, unknown>[]>(
    () => [
      {
        accessorKey: 'teacherCode',
        header: t('teacher.teacherCode'),
        cell: ({ row }) => <span className="font-medium">{row.original.teacherCode}</span>,
        meta: { sortKey: 'teacherCode' } satisfies DataTableColumnMeta,
      },
      {
        id: 'name',
        header: t('person.fullName'),
        cell: ({ row }) => (
          <div className="flex items-center gap-2.5">
            <Avatar className="size-8">
              {/* The staff list is read by face as much as by name. `photoUrl` is
                  a short-lived signed URL minted per request — the object key
                  never leaves the API — and initials remain the fallback for
                  whoever has no photo on file yet. */}
              {row.original.photoUrl && (
                <AvatarImage src={row.original.photoUrl} alt="" loading="lazy" />
              )}
              <AvatarFallback>{initials(row.original)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate font-medium">{fullName(row.original, i18n.language)}</p>
              {row.original.specialization && (
                <p className="truncate text-xs text-muted-foreground">{row.original.specialization}</p>
              )}
            </div>
          </div>
        ),
        meta: { sortKey: 'lastNameLo' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'gender',
        header: t('person.gender'),
        cell: ({ row }) => t(`gender.${row.original.gender}`),
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'phone',
        header: t('person.phone'),
        cell: ({ row }) => row.original.phone ?? '—',
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'status',
        header: t('person.status'),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={row.original.status} namespace="teacherStatus" />
            {row.original.isAcademicHead && (
              <Badge variant="info">{t('teacher.isAcademicHead')}</Badge>
            )}
          </div>
        ),
      },
      {
        accessorKey: 'hireDate',
        header: t('teacher.hireDate'),
        cell: ({ row }) => formatDate(row.original.hireDate),
        meta: { sortKey: 'hireDate', hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: t('common.details'),
                icon: Eye,
                onSelect: () => setDetailId(row.original.id),
              },
              {
                label: t('common.edit'),
                icon: Pencil,
                hidden: !can('teachers', 'update'),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('user.createLogin'),
                icon: KeyRound,
                // Hiring a teacher and giving them a login are two steps in one
                // conversation, so the second starts from the row rather than
                // from a search on the accounts page.
                hidden: !can('users', 'create'),
                onSelect: () => navigate(`/users?create=${row.original.id}`),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('teachers', 'delete'),
                onSelect: () => dialogs.askDelete(row.original),
              },
            ]}
          />
        ),
        meta: { className: 'w-12 text-end' } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language, can, dialogs, navigate],
  );

  const current = detail.data;
  const village = refObject<Location>(current?.villageId);

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('teacher.title')}
        actions={
          can('teachers', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('teacher.create')}
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
              placeholder={t('common.search')}
              className="w-full sm:w-64"
            />
            <FilterSelect
              value={table.filters.status}
              onChange={(value) => table.setFilter('status', value)}
              options={TEACHER_STATUSES.map((status) => ({
                value: status,
                label: t(`teacherStatus.${status}`),
              }))}
              placeholder={t('person.status')}
            />
            <FilterSelect
              value={table.filters.isAcademicHead}
              onChange={(value) => table.setFilter('isAcademicHead', value)}
              options={[
                { value: 'true', label: t('common.yes') },
                { value: 'false', label: t('common.no') },
              ]}
              placeholder={t('teacher.isAcademicHead')}
            />
          </TableToolbar>
        }
      />

      <TeacherFormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        teacher={dialogs.record}
      />

      <DetailDrawer
        open={detailId !== null}
        onOpenChange={(open) => !open && setDetailId(null)}
        title={current ? fullName(current, i18n.language) : t('common.details')}
        description={current?.teacherCode}
        isLoading={detail.isLoading}
        error={detail.error}
        onRetry={detail.refetch}
        footer={
          current &&
          can('teachers', 'update') && (
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
            <div className="flex items-start gap-4">
              <Avatar className="size-20 rounded-lg">
                {current.photoUrl && <AvatarImage src={current.photoUrl} alt="" />}
                <AvatarFallback className="rounded-lg text-lg">{initials(current)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={current.status} namespace="teacherStatus" />
                {current.isAcademicHead && <Badge variant="info">{t('teacher.isAcademicHead')}</Badge>}
              </div>
            </div>

            <DetailSection title={t('person.basicInfo')}>
              <DetailRow label={t('person.fullName')}>{fullName(current, i18n.language)}</DetailRow>
              <DetailRow label={t('person.gender')}>{t(`gender.${current.gender}`)}</DetailRow>
              <DetailRow label={t('person.dateOfBirth')}>
                {formatDate(current.dateOfBirth)}
                {calculateAge(current.dateOfBirth) !== null && (
                  <span className="ms-2 text-muted-foreground">
                    ({calculateAge(current.dateOfBirth)} {t('person.age')})
                  </span>
                )}
              </DetailRow>
              <DetailRow label={t('person.nationalId')}>{current.nationalId ?? '—'}</DetailRow>
            </DetailSection>

            <DetailSection title={t('person.contactInfo')}>
              <DetailRow label={t('person.phone')}>{current.phone ?? '—'}</DetailRow>
              <DetailRow label={t('person.email')}>{current.email ?? '—'}</DetailRow>
            </DetailSection>

            <DetailSection title={t('person.addressInfo')}>
              <DetailRow label={t('person.village')}>
                {village ? localizedName(village, i18n.language) : '—'}
              </DetailRow>
              <DetailRow label={t('person.addressDetail')}>{current.addressDetail ?? '—'}</DetailRow>
            </DetailSection>

            <DetailSection title={t('person.workInfo')}>
              <DetailRow label={t('teacher.qualification')}>{current.qualification ?? '—'}</DetailRow>
              <DetailRow label={t('teacher.specialization')}>{current.specialization ?? '—'}</DetailRow>
              <DetailRow label={t('teacher.hireDate')}>{formatDate(current.hireDate)}</DetailRow>
            </DetailSection>

            {can('teachers', 'update') && (
              <FileUpload
                label={t('person.photo')}
                currentUrl={current.photoUrl}
                onUpload={(file, onProgress) => uploadPhoto.mutateAsync({ file, onProgress })}
                onUploaded={() => void detail.refetch()}
              />
            )}
          </div>
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={
          dialogs.deleteTarget
            ? t('teacher.deleteConfirm', { name: fullName(dialogs.deleteTarget, i18n.language) })
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
