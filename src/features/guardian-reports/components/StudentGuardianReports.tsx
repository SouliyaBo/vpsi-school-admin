import { Ban, Eye, Link2, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { notify } from '@/lib/toast';
import { formatDate, formatDateTime, refId } from '@/lib/utils';
import type { GuardianReport, Semester, Student } from '@/types/entities';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { RowActions } from '@/components/common/RowActions';
import { StatusBadge } from '@/components/common/StatusBadge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  useGuardianReports,
  useReissueGuardianReport,
  useRevokeGuardianReport,
  type IssuedGuardianReport,
} from '../api';
import { CreateGuardianReportDialog } from './CreateGuardianReportDialog';
import { GuardianReportView } from './GuardianReportView';
import { ReportLinkDialog } from './ReportLinkDialog';

/**
 * The student page's ລາຍງານຜູ້ປົກຄອງ tab: what has been sent, whether the family
 * opened it, and the three things to do about a link — send a new one, replace a
 * lost or locked one, or stop one for good.
 *
 * Who may send is the server's call (the room's homeroom teacher, or the office), so the
 * button is offered to anyone holding `create` and the dialog shows the refusal
 * if they are not that teacher.
 */
export function StudentGuardianReports({
  student,
  semester,
  enabled,
}: {
  student: Student;
  semester: Semester | undefined;
  enabled: boolean;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const canSend = can('guardian-reports', 'create');
  const canRevoke = can('guardian-reports', 'delete');

  const reports = useGuardianReports(student.id, enabled);
  const reissue = useReissueGuardianReport();
  const revoke = useRevokeGuardianReport();

  const [createOpen, setCreateOpen] = useState(false);
  const [issued, setIssued] = useState<{ value: IssuedGuardianReport; guardianId: string } | null>(
    null,
  );
  const [viewing, setViewing] = useState<GuardianReport | null>(null);
  const [revoking, setRevoking] = useState<GuardianReport | null>(null);

  // The phone is on the student's own guardian links, which the page already holds.
  const phoneOf = (guardianId: string) =>
    student.guardians.find((link) => refId(link.guardianId) === guardianId)?.phone ?? null;

  const header = canSend && (
    <div className="flex justify-end">
      <Button onClick={() => setCreateOpen(true)}>
        <Send aria-hidden />
        {t('guardianReport.create')}
      </Button>
    </div>
  );

  let body;
  if (reports.isLoading) body = <Skeleton className="h-32 w-full" />;
  else if (reports.error) body = <ErrorState error={reports.error} onRetry={reports.refetch} />;
  else if (!reports.data?.length) body = <EmptyState title={t('guardianReport.empty')} />;
  else
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('guardianReport.month')}</TableHead>
            <TableHead>{t('guardianReport.guardian')}</TableHead>
            <TableHead>{t('guardianReport.sentAt')}</TableHead>
            <TableHead>{t('guardianReport.opened')}</TableHead>
            <TableHead>{t('guardianReport.expires')}</TableHead>
            <TableHead>{t('common.status')}</TableHead>
            <TableHead className="w-10" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {reports.data.map((report) => (
            <TableRow key={report.id}>
              <TableCell>{t(`month.${report.month}`)}</TableCell>
              <TableCell>
                {report.snapshot.guardian.nameLo}{' '}
                <span className="text-muted-foreground">
                  ({t(`relationship.${report.snapshot.guardian.relationship}`)})
                </span>
              </TableCell>
              <TableCell>{formatDateTime(report.createdAt)}</TableCell>
              <TableCell>
                {report.viewCount > 0
                  ? t('guardianReport.openedCount', {
                      count: report.viewCount,
                      date: formatDateTime(report.lastViewedAt),
                    })
                  : t('guardianReport.notOpened')}
              </TableCell>
              <TableCell>{formatDate(report.expiresAt)}</TableCell>
              <TableCell>
                <StatusBadge status={report.state} namespace="guardianReport.state" />
              </TableCell>
              <TableCell>
                <RowActions
                  actions={[
                    {
                      label: t('guardianReport.view'),
                      icon: Eye,
                      onSelect: () => setViewing(report),
                    },
                    {
                      label: t('guardianReport.reissue'),
                      icon: Link2,
                      hidden: !canSend || report.state === 'revoked',
                      onSelect: () =>
                        reissue.mutate(report.id, {
                          onSuccess: (value) => setIssued({ value, guardianId: report.guardianId }),
                        }),
                    },
                    {
                      label: t('guardianReport.revoke'),
                      icon: Ban,
                      destructive: true,
                      hidden: !canRevoke || report.state === 'revoked',
                      onSelect: () => setRevoking(report),
                    },
                  ]}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );

  return (
    <div className="space-y-4">
      {header}
      <div className="overflow-x-auto">{body}</div>

      <CreateGuardianReportDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        studentId={student.id}
        semester={semester}
        onIssued={(value, guardianId) => setIssued({ value, guardianId })}
      />

      <ReportLinkDialog
        issued={issued?.value ?? null}
        guardianPhone={issued ? phoneOf(issued.guardianId) : null}
        onClose={() => setIssued(null)}
      />

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('guardianReport.publicTitle')}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="scrollbar-thin min-h-0 overflow-y-auto">
              <GuardianReportView
                content={viewing.snapshot}
                sections={viewing.snapshot.sections}
                message={viewing.snapshot.message}
                guardian={viewing.snapshot.guardian}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={t('guardianReport.revokeTitle')}
        description={t('guardianReport.revokeConfirm')}
        confirmLabel={t('guardianReport.revoke')}
        tone="danger"
        isPending={revoke.isPending}
        onConfirm={() =>
          revoking &&
          revoke.mutate(revoking.id, {
            onSuccess: () => {
              setRevoking(null);
              notify.success(t('guardianReport.revokedToast'));
            },
          })
        }
      />
    </div>
  );
}
