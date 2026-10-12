import { FileCheck2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { useActiveSemester } from '@/features/semesters/api';
import { qualifyClassName, useMonthlyReportCompliance, type MonthlyReportStatus } from '../api';
import { ReportStatusChip } from './ReportEntryForm';

/**
 * ການສົ່ງບົດສະຫຼຸບປະຈຳເດືອນ — every room against every month, for the office.
 *
 * Due by the 5th of the next month; a report sent after it shows ສົ່ງຊ້າ with how
 * many days, and one still not sent turns red once the 5th has passed. A cell
 * opens that room's report on the report tab, which is where the office reads
 * what was sent.
 */
export function MonthlyReportCompliance() {
  const { t } = useTranslation();
  const semester = useActiveSemester();
  const grid = useMonthlyReportCompliance(semester.data?.id);
  const [params, setParams] = useSearchParams();

  const open = (classroomId: string, month: number) => {
    const next = new URLSearchParams(params);
    next.set('tab', 'report');
    next.set('classroomId', classroomId);
    next.set('month', String(month));
    setParams(next);
  };

  if (grid.isLoading) return <Skeleton className="h-64 w-full" />;
  if (grid.error) return <ErrorState error={grid.error} onRetry={() => grid.refetch()} />;
  const data = grid.data;
  if (!data) return null;
  if (data.months.length === 0) {
    return <EmptyState icon={FileCheck2} title={t('homeroomReview.report.nothingOwedYet')} />;
  }

  const statuses: MonthlyReportStatus[] = ['submitted', 'late', 'missing', 'pending'];

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted-foreground">{t('homeroomReview.report.ruleHint')}</span>
          {statuses.map((status) => (
            <span key={status} className="flex items-center gap-1">
              <ReportStatusChip status={status} />
              <span className="font-semibold tabular-nums">{data.summary[status]}</span>
            </span>
          ))}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-28">{t('homeroomReview.classroom')}</TableHead>
                <TableHead className="min-w-40">{t('homeroomReview.homeroomTeacher')}</TableHead>
                {data.months.map((month) => (
                  <TableHead key={`${month.year}-${month.month}`} className="min-w-36">
                    <span className="block">{t(`month.${month.month}`)}</span>
                    <span className="block text-xs font-normal text-muted-foreground">
                      {t('homeroomReview.report.dueBy')} {formatDate(month.dueDate)}
                    </span>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.classroomId}>
                  <TableCell className="font-medium">
                    {qualifyClassName(row.classroomName, row.gradeLevelCode)}
                  </TableCell>
                  <TableCell>{row.teacherName ?? '—'}</TableCell>
                  {row.cells.map((cell) => (
                    <TableCell key={`${cell.year}-${cell.month}`}>
                      <button
                        type="button"
                        className="space-y-1 text-start"
                        onClick={() => open(row.classroomId, cell.month)}
                        aria-label={`${row.classroomName} ${t(`month.${cell.month}`)}`}
                      >
                        <ReportStatusChip status={cell.status} />
                        {cell.firstSubmittedAt && (
                          <span className="block text-xs text-muted-foreground">
                            {formatDateTime(cell.firstSubmittedAt)}
                          </span>
                        )}
                        {cell.daysLate > 0 && (
                          <span className="block text-xs font-medium text-warning">
                            {t('homeroomReview.report.daysLate', { n: cell.daysLate })}
                          </span>
                        )}
                      </button>
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
