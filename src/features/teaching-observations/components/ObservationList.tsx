import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Eye, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan, useCurrentUser } from '@/features/auth/hooks';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { formatDate, fullName, localizedName, refId, refObject } from '@/lib/utils';
import { TEACHING_OBSERVATION_STATUSES } from '@/types/enums';
import type { Classroom, Subject, Teacher, TeachingObservation } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, TableToolbar } from '@/components/common/TableToolbar';
import {
  isEditable,
  useAcknowledgeObservation,
  useObservations,
  useSubmitObservation,
  useWithdrawObservation,
} from '../api';
import { ObservationDetailDrawer } from './ObservationDetailDrawer';
import { ObservationFormDialog } from './ObservationFormDialog';

/** The sheets themselves — one row per visit. */
export function ObservationList() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const me = useCurrentUser();
  const table = useTableQueryState({
    defaultSortBy: 'observedAt',
    defaultSortOrder: 'desc',
    filterKeys: ['status'],
  });
  const dialogs = useCrudDialogs<TeachingObservation>();
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = useObservations(table.queryParams);
  const submit = useSubmitObservation();
  const acknowledge = useAcknowledgeObservation();
  const withdraw = useWithdrawObservation();

  const ownTeacherId = me?.personType === 'teacher' ? me.personId : null;

  const columns = useMemo<ColumnDef<TeachingObservation, unknown>[]>(
    () => [
      {
        accessorKey: 'observedAt',
        header: t('observation.observedAt'),
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{formatDate(row.original.observedAt)}</p>
            <p className="text-xs text-muted-foreground">
              {t('observation.visitOrdinal', { number: row.original.visitNumber })}
            </p>
          </div>
        ),
        meta: { sortKey: 'observedAt' } satisfies DataTableColumnMeta,
      },
      {
        id: 'teacher',
        header: t('observation.observedTeacher'),
        cell: ({ row }) => (
          <span className="font-medium">
            {fullName(refObject<Teacher>(row.original.teacherId), i18n.language)}
          </span>
        ),
      },
      {
        id: 'observer',
        header: t('observation.observer'),
        // The column the paper form is missing, and the reason for the feature —
        // so it sits beside the observed teacher rather than at the far end.
        cell: ({ row }) => fullName(refObject<Teacher>(row.original.observerId), i18n.language),
      },
      {
        id: 'lesson',
        header: t('observation.lesson'),
        cell: ({ row }) => {
          const subject = refObject<Subject>(row.original.subjectId);
          const classroom = refObject<Classroom>(row.original.classroomId);
          return (
            <div className="min-w-0">
              <p className="truncate">{subject ? localizedName(subject, i18n.language) : '—'}</p>
              <p className="truncate text-xs text-muted-foreground">{classroom?.name ?? '—'}</p>
            </div>
          );
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'totalScore',
        header: t('observation.total'),
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">
            {row.original.totalScore}
            <span className="text-muted-foreground"> / {row.original.maxScore || '—'}</span>
          </span>
        ),
        meta: { sortKey: 'totalScore', className: 'text-end' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'status',
        header: t('common.status'),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={row.original.status} namespace="observationStatus" />
            {refId(row.original.observerId) === ownTeacherId && (
              <Badge variant="outline">{t('observation.mine')}</Badge>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const sheet = row.original;
          const isObserver = refId(sheet.observerId) === ownTeacherId;
          const isObserved = refId(sheet.teacherId) === ownTeacherId;
          const mayWrite = isObserver || can('teaching-observations', 'manage');

          return (
            <RowActions
              actions={[
                {
                  label: t('common.details'),
                  icon: Eye,
                  onSelect: () => setDetailId(sheet.id),
                },
                {
                  label: t('common.edit'),
                  icon: Pencil,
                  hidden: !mayWrite || !isEditable(sheet),
                  onSelect: () => dialogs.openEdit(sheet),
                },
                {
                  label: t('observation.submit'),
                  icon: Send,
                  hidden: !mayWrite || !isEditable(sheet),
                  disabled: submit.isPending,
                  onSelect: () => submit.mutate(sheet.id),
                },
                {
                  // Only the observed teacher can say they have read it, which is
                  // why this is keyed off the row rather than off a permission.
                  label: t('observation.acknowledge'),
                  icon: CheckCircle2,
                  hidden: !isObserved || sheet.status !== 'submitted',
                  disabled: acknowledge.isPending,
                  onSelect: () => acknowledge.mutate(sheet.id),
                },
                {
                  label: t('observation.withdraw'),
                  icon: Trash2,
                  destructive: true,
                  hidden:
                    !can('teaching-observations', 'delete') ||
                    (!isEditable(sheet) && !can('teaching-observations', 'manage')) ||
                    !mayWrite,
                  onSelect: () => dialogs.askDelete(sheet),
                },
              ]}
            />
          );
        },
        meta: { className: 'w-12 text-end' } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language, can, dialogs, ownTeacherId, submit, acknowledge],
  );

  return (
    <div className="space-y-4">
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
        emptyTitle={t('observation.emptyTitle')}
        emptyDescription={t('observation.emptyDescription')}
        emptyAction={
          can('teaching-observations', 'create') && (
            <Button onClick={dialogs.openCreate}>
              <Plus />
              {t('observation.newSheet')}
            </Button>
          )
        }
        toolbar={
          <TableToolbar
            hasActiveFilters={table.hasActiveFilters}
            onClearFilters={table.clearFilters}
          >
            <FilterSelect
              value={table.filters.status}
              onChange={(value) => table.setFilter('status', value)}
              options={TEACHING_OBSERVATION_STATUSES.map((status) => ({
                value: status,
                label: t(`observationStatus.${status}`),
              }))}
              placeholder={t('common.status')}
            />
            {can('teaching-observations', 'create') && (
              <Button className="ms-auto" onClick={dialogs.openCreate}>
                <Plus />
                {t('observation.newSheet')}
              </Button>
            )}
          </TableToolbar>
        }
      />

      <ObservationFormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        observation={dialogs.record}
      />

      <ObservationDetailDrawer
        id={detailId}
        onOpenChange={(open) => !open && setDetailId(null)}
        onEdit={(sheet) => {
          setDetailId(null);
          dialogs.openEdit(sheet);
        }}
      />

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('observation.withdrawTitle')}
        description={t('observation.withdrawDescription')}
        confirmLabel={t('observation.withdraw')}
        isPending={withdraw.isPending}
        onConfirm={() => {
          const target = dialogs.deleteTarget;
          if (!target) return;
          withdraw.mutate(target.id, { onSuccess: () => dialogs.cancelDelete() });
        }}
      />
    </div>
  );
}
