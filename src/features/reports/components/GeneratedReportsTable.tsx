import { ExternalLink, FileText, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { classroomHeading } from '@/features/classrooms/api';
import { notify } from '@/lib/toast';
import { formatDateTime, localizedName } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Pagination } from '@/components/common/Pagination';
import { StatusBadge } from '@/components/common/StatusBadge';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import {
  openReport,
  useDeleteReport,
  useGeneratedReports,
  type GeneratedReport,
  type GeneratedReportParams,
} from '../api';

/**
 * The PDFs the API has rendered, newest first, with a button to open each.
 *
 * What a row says is decided by the API: a homeroom teacher is sent only their
 * own room's, so nothing here filters. The list keeps asking while a row is
 * still rendering, so the button appears without a reload.
 */
export function GeneratedReportsTable({
  params,
  paged = false,
  emptyHint,
}: {
  params: GeneratedReportParams;
  /** The history tab pages; the panel under the button shows the latest few. */
  paged?: boolean;
  emptyHint?: string;
}) {
  const { t, i18n } = useTranslation();
  const can = useCan();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(paged ? 20 : 5);
  const [deleting, setDeleting] = useState<GeneratedReport | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const reports = useGeneratedReports({ ...params, page, limit });
  const remove = useDeleteReport();
  const rows = reports.data?.data ?? [];

  async function open(id: string) {
    setOpening(id);
    try {
      await openReport(id);
    } catch (error) {
      notify.error(error);
    } finally {
      setOpening(null);
    }
  }

  if (reports.isError) {
    return <ErrorState error={reports.error} onRetry={() => reports.refetch()} compact />;
  }
  if (reports.isLoading) return <TableSkeleton rows={3} columns={5} />;
  if (rows.length === 0) {
    return (
      <EmptyState icon={FileText} title={t('report.history.empty')} description={emptyHint} />
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('report.history.createdAt')}</TableHead>
              <TableHead>{t('report.history.what')}</TableHead>
              <TableHead>{t('report.history.semester')}</TableHead>
              <TableHead>{t('report.history.status')}</TableHead>
              <TableHead className="text-end">{t('common.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatDateTime(row.createdAt)}
                </TableCell>
                <TableCell>
                  <p className="font-medium">
                    {row.classroomName
                      ? classroomHeading({
                          name: row.classroomName,
                          gradeLevelCode: row.gradeLevelCode,
                        })
                      : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.studentId
                      ? t('report.history.oneStudent')
                      : t('report.history.classPack', { count: row.params.students ?? 0 })}
                  </p>
                </TableCell>
                <TableCell>
                  {localizedName(
                    { nameLo: row.semesterNameLo, nameEn: row.semesterNameEn },
                    i18n.language,
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} namespace="reportStatus" />
                  {row.status === 'failed' && row.errorMessage && (
                    <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                      {row.errorMessage}
                    </p>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {row.status === 'completed' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={opening === row.id}
                        onClick={() => open(row.id)}
                      >
                        {opening === row.id ? <Loader2 className="animate-spin" /> : <ExternalLink />}
                        {t('report.history.open')}
                      </Button>
                    )}
                    {(row.status === 'queued' || row.status === 'processing') && (
                      <Loader2
                        className="size-4 animate-spin text-muted-foreground"
                        aria-label={t('reportStatus.processing')}
                      />
                    )}
                    {can('reports', 'delete') && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={t('common.delete')}
                        onClick={() => setDeleting(row)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {paged && reports.data && (
        <Pagination
          meta={reports.data.meta}
          onPageChange={setPage}
          onLimitChange={(next) => {
            setLimit(next);
            setPage(1);
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t('report.history.deleteTitle')}
        description={t('report.history.deleteBody')}
        tone="danger"
        isPending={remove.isPending}
        onConfirm={() => {
          if (!deleting) return;
          remove.mutate(deleting.id, {
            onSuccess: () => setDeleting(null),
            onError: (error) => notify.error(error),
          });
        }}
      />
    </div>
  );
}
