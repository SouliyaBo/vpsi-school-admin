import { Syringe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { StatusBadge } from '@/components/common/StatusBadge';
import { TableSkeleton } from '@/components/common/TableSkeleton';
import { useStudentVaccinations } from '../api';

/**
 * One student's dose history, for the student detail page.
 *
 * `enabled` is the tab's own visibility: every read of one child's vaccination
 * record is audited server-side, so this must not be fetched while the reader is
 * looking at some other tab — a trail of lookups nobody performed is worse than
 * no trail.
 */
export function StudentVaccinations({
  studentId,
  enabled,
}: {
  studentId: string | undefined;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const query = useStudentVaccinations(studentId, enabled);

  if (query.isLoading) return <TableSkeleton columns={5} />;
  if (query.error) return <ErrorState error={query.error} onRetry={query.refetch} compact />;

  const records = query.data?.data ?? [];
  if (records.length === 0) {
    return (
      <EmptyState
        icon={Syringe}
        title={t('vaccination.noRecords')}
        description={t('vaccination.noRecordsHint')}
      />
    );
  }

  return (
    <div className="scrollbar-thin overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('vaccination.vaccine')}</TableHead>
            <TableHead>{t('vaccination.doseNumber')}</TableHead>
            <TableHead>{t('vaccination.outcome')}</TableHead>
            <TableHead>{t('vaccination.administeredDate')}</TableHead>
            <TableHead>{t('vaccination.consent')}</TableHead>
            <TableHead className="hidden md:table-cell">
              {t('vaccination.batchNumber')}
            </TableHead>
            <TableHead className="hidden md:table-cell">{t('vaccination.reason')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((record) => (
            <TableRow key={record.id}>
              <TableCell className="font-medium">{t(`vaccine.${record.vaccine}`)}</TableCell>
              <TableCell>{record.doseNumber}</TableCell>
              <TableCell>
                <StatusBadge status={record.status} namespace="vaccinationStatus" />
              </TableCell>
              <TableCell>
                {record.administeredDate ? (
                  formatDate(record.administeredDate)
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell>
                <StatusBadge status={record.consent?.status} namespace="consentStatus" />
              </TableCell>
              <TableCell className="hidden font-mono text-xs md:table-cell">
                {record.batchNumber ?? '—'}
              </TableCell>
              <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                {record.notes ?? '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
