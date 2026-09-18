import type { ColumnDef } from '@tanstack/react-table';
import { Eye, FileUp, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useCan } from '@/features/auth/hooks';
import { useTableQueryState } from '@/hooks/use-table-query-state';
import { formatDate, localizedName, refObject } from '@/lib/utils';
import type { Classroom, ExamPaperSummary, Subject, User } from '@/types/entities';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { DataTable, type DataTableColumnMeta } from '@/components/common/DataTable';
import { PageHeader } from '@/components/common/PageHeader';
import { RowActions } from '@/components/common/RowActions';
import { SearchInput, TableToolbar } from '@/components/common/TableToolbar';
import { useDeleteExamPaper, useExamPapers } from '../api';
import { UploadExamPaperDialog } from '../components/UploadExamPaperDialog';

/**
 * ຈັດການບົດສອບປາລະໄນ — the papers, one row each.
 *
 * A row is a paper at some stage of upload → review → draw → print; the set
 * count is what says which. Everything else happens on the paper's own page.
 */
export function ExamPapersPage() {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const navigate = useNavigate();
  const table = useTableQueryState({ defaultSortBy: 'createdAt', defaultSortOrder: 'desc' });
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ExamPaperSummary | null>(null);

  const list = useExamPapers(table.queryParams);
  const remove = useDeleteExamPaper();
  const seesEverybody = can('exam-papers', 'manage');

  const columns = useMemo<ColumnDef<ExamPaperSummary, unknown>[]>(
    () => [
      {
        accessorKey: 'title',
        header: t('examPaper.titleField'),
        cell: ({ row }) => {
          const subject = refObject<Subject>(row.original.subjectId);
          const classroom = refObject<Classroom>(row.original.classroomId);
          const under = [
            subject ? localizedName(subject, i18n.language) : null,
            classroom?.name ?? null,
          ].filter(Boolean);
          return (
            <div className="min-w-0">
              <p className="truncate font-medium">{row.original.title}</p>
              {under.length > 0 && (
                <p className="truncate text-xs text-muted-foreground">{under.join(' · ')}</p>
              )}
            </div>
          );
        },
        meta: { sortKey: 'title' } satisfies DataTableColumnMeta,
      },
      {
        accessorKey: 'questionCount',
        header: t('examPaper.questions'),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {t('examPaper.questionCount', { count: row.original.questionCount })}
          </span>
        ),
        meta: { className: 'text-end' } satisfies DataTableColumnMeta,
      },
      {
        id: 'sets',
        header: t('examPaper.sets'),
        cell: ({ row }) =>
          row.original.generatedAt ? (
            <Badge>{t('examPaper.setCount', { count: row.original.variantCount })}</Badge>
          ) : (
            <Badge variant="outline">{t('examPaper.noSets')}</Badge>
          ),
      },
      ...(seesEverybody
        ? [
            {
              id: 'owner',
              header: t('examPaper.owner'),
              cell: ({ row }) => refObject<User>(row.original.createdById)?.username ?? '—',
              meta: { hideOnMobile: true } satisfies DataTableColumnMeta,
            } satisfies ColumnDef<ExamPaperSummary, unknown>,
          ]
        : []),
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
                label: t('common.details'),
                icon: Eye,
                onSelect: () => navigate(`/exam-papers/${row.original.id}`),
              },
              {
                label: t('examPaper.delete'),
                icon: Trash2,
                destructive: true,
                hidden: !can('exam-papers', 'delete'),
                onSelect: () => setDeleteTarget(row.original),
              },
            ]}
          />
        ),
        meta: { className: 'w-12 text-end' } satisfies DataTableColumnMeta,
      },
    ],
    [t, i18n.language, can, navigate, seesEverybody],
  );

  const uploadButton = can('exam-papers', 'create') && (
    <Button onClick={() => setUploadOpen(true)}>
      <FileUp />
      {t('examPaper.upload')}
    </Button>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('examPaper.title')}
        description={t('examPaper.subtitle')}
        actions={uploadButton}
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
        onRowClick={(row) => navigate(`/exam-papers/${row.id}`)}
        getRowId={(row) => row.id}
        emptyTitle={t('examPaper.emptyTitle')}
        emptyDescription={t('examPaper.emptyDescription')}
        emptyAction={uploadButton}
        toolbar={
          <TableToolbar
            hasActiveFilters={table.hasActiveFilters}
            onClearFilters={table.clearFilters}
          >
            <SearchInput value={table.search ?? ''} onChange={table.setSearch} />
          </TableToolbar>
        }
      />

      <UploadExamPaperDialog open={uploadOpen} onOpenChange={setUploadOpen} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('examPaper.deleteTitle')}
        description={t('examPaper.deleteDescription')}
        confirmLabel={t('examPaper.delete')}
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deleteTarget) return;
          remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
        }}
      />
    </div>
  );
}
