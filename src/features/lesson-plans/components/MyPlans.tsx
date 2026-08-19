import type { ColumnDef } from '@tanstack/react-table';
import { Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '@/features/auth/hooks';
import { useActiveSemester } from '@/features/semesters/api';
import { useCrudDialogs } from '@/hooks/use-crud-dialogs';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { formatDate, localizedName, refObject } from '@/lib/utils';
import { LESSON_PLAN_STATUSES } from '@/types/enums';
import type { Classroom, LessonPlan, Subject } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, TableToolbar } from '@/components/common/TableToolbar';
import {
  isEditable,
  isSubmittable,
  taughtCount,
  useDeleteLessonPlan,
  useLessonPlans,
  useSubmitLessonPlan,
} from '../api';
import { PlanDetailDrawer } from './PlanDetailDrawer';
import { PlanFormDialog } from './PlanFormDialog';

/**
 * A teacher's own plans.
 *
 * Scoped by `teacherId` from the signed-in account rather than by a picker: the
 * API files a new plan against the caller's own identity regardless, so a picker
 * would let someone browse to a colleague and then create in their own name.
 */
export function MyPlans() {
  const { t, i18n } = useTranslation();
  const user = useCurrentUser();
  const activeSemester = useActiveSemester();

  const table = useTableQueryState({
    defaultSortBy: 'dueDate',
    defaultSortOrder: 'desc',
    filterKeys: ['status'],
  });
  const dialogs = useCrudDialogs<LessonPlan>();
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  const teacherId = user?.personType === 'teacher' ? user.personId : null;

  const list = useLessonPlans({ ...table.queryParams, teacherId: teacherId ?? undefined });
  const submit = useSubmitLessonPlan();
  const remove = useDeleteLessonPlan();

  const columns = useMemo<ColumnDef<LessonPlan, unknown>[]>(
    () => [
      {
        id: 'week',
        header: t('lessonPlan.week'),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {formatDate(row.original.weekStartDate)}
          </span>
        ),
      },
      {
        accessorKey: 'title',
        header: t('common.title'),
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
      },
      {
        id: 'lesson',
        header: t('lessonPlan.lesson'),
        cell: ({ row }) => {
          const subject = refObject<Subject>(row.original.subjectId);
          const classroom = refObject<Classroom>(row.original.classroomId);
          return (
            <span className="text-sm">
              {localizedName(subject, i18n.language)}
              {classroom ? ` · ${classroom.name}` : ''}
            </span>
          );
        },
        meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'dueDate',
        header: t('lessonPlan.due'),
        cell: ({ row }) => (
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            {formatDate(row.original.dueDate)}
            {row.original.isLate && <Badge variant="danger">{t('lessonPlan.late')}</Badge>}
          </span>
        ),
        meta: { sortKey: 'dueDate' } satisfies DataTableColumnMeta,
      },
      {
        id: 'taught',
        header: t('lessonPlan.done'),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {taughtCount(row.original.activities)}/{row.original.activities.length}
          </span>
        ),
        meta: { className: 'w-20 text-center', hideOnMobile: true } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'status',
        header: t('common.status'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} namespace="lessonPlanStatus" />
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <RowActions
            actions={[
              {
                label: t('lessonPlan.submit'),
                icon: Send,
                hidden: !isSubmittable(row.original),
                onSelect: () => void submit.mutateAsync(row.original.id).catch(() => {}),
              },
              {
                label: t('common.edit'),
                icon: Pencil,
                // A submitted or approved plan is not the teacher's to change —
                // the API rejects it, so the action is hidden rather than failing.
                hidden: !isEditable(row.original.status),
                onSelect: () => dialogs.openEdit(row.original),
              },
              {
                label: t('common.delete'),
                icon: Trash2,
                destructive: true,
                hidden: row.original.status === 'approved',
                onSelect: () => dialogs.askDelete(row.original),
              },
            ]}
          />
        ),
        meta: { className: 'w-12 text-end' } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language, dialogs, submit],
  );

  // A non-teacher account has no plans of its own — the office reviews, it does
  // not file. Saying so beats an empty table that looks like a failed load.
  if (!teacherId) {
    return (
      <EmptyState
        title={t('lessonPlan.notATeacher')}
        description={t('lessonPlan.notATeacherHint')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('lessonPlan.myPlans')}
        actions={
          <Button onClick={dialogs.openCreate}>
            <Plus />
            {t('lessonPlan.create')}
          </Button>
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
        onRowClick={(row) => setOpenPlanId(row.id)}
        emptyTitle={t('lessonPlan.noPlans')}
        emptyDescription={t('lessonPlan.noPlansHint')}
        toolbar={
          <TableToolbar
            hasActiveFilters={table.hasActiveFilters}
            onClearFilters={table.clearFilters}
          >
            <FilterSelect
              value={table.filters.status}
              onChange={(value) => table.setFilter('status', value)}
              options={LESSON_PLAN_STATUSES.map((status) => ({
                value: status,
                label: t(`lessonPlanStatus.${status}`),
              }))}
              placeholder={t('common.status')}
            />
          </TableToolbar>
        }
      />

      <PlanFormDialog
        open={dialogs.formOpen}
        onOpenChange={dialogs.setFormOpen}
        plan={dialogs.record}
        defaultSemesterId={activeSemester.data?.id}
      />

      <PlanDetailDrawer planId={openPlanId} onClose={() => setOpenPlanId(null)} mode="own" />

      <ConfirmDialog
        open={dialogs.deleteTarget !== null}
        onOpenChange={(open) => !open && dialogs.cancelDelete()}
        title={t('common.delete')}
        description={dialogs.deleteTarget?.title}
        isPending={remove.isPending}
        onConfirm={() => {
          if (!dialogs.deleteTarget) return;
          void remove.mutateAsync(dialogs.deleteTarget.id).finally(dialogs.cancelDelete);
        }}
      />
    </div>
  );
}
