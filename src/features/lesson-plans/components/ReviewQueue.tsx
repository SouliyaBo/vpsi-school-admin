import type { ColumnDef } from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSubjectGroupOptions } from '@/features/subject-groups/api';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { formatDate, localizedName, refObject } from '@/lib/utils';
import type { Classroom, LessonPlan, Subject, Teacher } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { StatusBadge } from '@/components/common/StatusBadge';
import { FilterSelect, TableToolbar } from '@/components/common/TableToolbar';
import { useReviewQueue } from '../api';
import { PlanDetailDrawer } from './PlanDetailDrawer';

/**
 * Plans waiting on a decision, earliest deadline first.
 *
 * A flat list rather than a grid: this is a work queue, so the order is the
 * point. The matrix answers "who is behind"; this answers "what do I clear
 * next".
 */
export function ReviewQueue() {
  const { t, i18n } = useTranslation();
  const table = useTableQueryState({
    defaultSortBy: 'dueDate',
    defaultSortOrder: 'asc',
    filterKeys: ['subjectGroupId'],
  });
  const [openPlanId, setOpenPlanId] = useState<string | null>(null);

  const list = useReviewQueue(table.queryParams);
  const groupOptions = useSubjectGroupOptions();

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
        id: 'teacher',
        header: t('teacher.title'),
        cell: ({ row }) => {
          const teacher = refObject<Teacher>(row.original.teacherId);
          return teacher ? `${teacher.firstNameLo} ${teacher.lastNameLo}` : '—';
        },
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
      },
      {
        accessorKey: 'title',
        header: t('common.title'),
        cell: ({ row }) => <span className="font-medium">{row.original.title}</span>,
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
        accessorKey: 'status',
        header: t('common.status'),
        cell: ({ row }) => (
          <StatusBadge status={row.original.status} namespace="lessonPlanStatus" />
        ),
      },
      {
        id: 'attachments',
        header: t('lessonPlan.files'),
        cell: ({ row }) => row.original.attachments.length || '—',
        meta: { className: 'w-16 text-center', hideOnMobile: true } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language],
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
        getRowId={(row) => row.id}
        onRowClick={(row) => setOpenPlanId(row.id)}
        emptyTitle={t('lessonPlan.queueEmpty')}
        emptyDescription={t('lessonPlan.queueEmptyHint')}
        toolbar={
          <TableToolbar
            hasActiveFilters={table.hasActiveFilters}
            onClearFilters={table.clearFilters}
          >
            <FilterSelect
              value={table.filters.subjectGroupId}
              onChange={(value) => table.setFilter('subjectGroupId', value)}
              options={groupOptions.data ?? []}
              placeholder={t('subjectGroup.title')}
            />
          </TableToolbar>
        }
      />

      <PlanDetailDrawer planId={openPlanId} onClose={() => setOpenPlanId(null)} mode="review" />
    </div>
  );
}
