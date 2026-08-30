import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCan } from '@/features/auth/hooks';
import { formatDate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { StudentName } from '@/components/common/StudentName';
import {
  ESCALATION_TONES,
  useRevokeDeduction,
  useStudentLedger,
  type ClassStandingRow,
} from '../api';
import { NotifyList } from './NotifyList';

/**
 * One child's account for the term, oldest first.
 *
 * Read forwards, unlike every other log in the system: this is what a meeting
 * with the guardians is held over, and an account is read from the top — what
 * happened, then what happened next, then where that leaves them.
 *
 * Withdrawing a row asks for a reason before it will do anything. The child was
 * told they had lost these points, so taking them back is a decision in its own
 * right rather than an undo, and the reason is what an appeal is later read
 * from. Only the office may do it — a teacher who files one in error asks for it
 * to be withdrawn, which is the same conversation the paper sheet forces.
 */
export function StudentLedgerDialog({
  open,
  onOpenChange,
  student,
  semesterId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: ClassStandingRow | null;
  semesterId: string | undefined;
}) {
  const { t } = useTranslation();
  const can = useCan();
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const ledger = useStudentLedger(open ? student?.studentId : undefined, semesterId);
  const revoke = useRevokeDeduction();
  const mayRevoke = can('conduct-scores', 'delete');

  function confirmRevoke(id: string) {
    if (!reason.trim()) return;
    revoke
      .mutateAsync({ id, reason: reason.trim() })
      .then(() => {
        setRevokingId(null);
        setReason('');
      })
      // Reported by the toast. The box stays open and the reason typed, so a
      // closed term or a lost connection does not cost the sentence twice.
      .catch(() => undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            <StudentName name={student?.studentNameLo} nickname={student?.studentNickname} />
          </DialogTitle>
          <DialogDescription>{t('conductDeduction.ledgerHint')}</DialogDescription>
        </DialogHeader>

        {ledger.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : ledger.error ? (
          <ErrorState error={ledger.error} onRetry={ledger.refetch} compact />
        ) : !ledger.data ? null : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <span className="text-sm text-muted-foreground">
                {t('conductDeduction.balanceLine', {
                  base: ledger.data.baseScore,
                  deducted: ledger.data.deducted,
                })}
              </span>
              <span className="flex items-center gap-2">
                <span className="text-lg font-semibold tabular-nums">{ledger.data.remaining}</span>
                <Badge variant={ESCALATION_TONES[ledger.data.level]}>
                  {t(`conductEscalation.${ledger.data.level}`)}
                </Badge>
              </span>
            </div>

            {ledger.data.notify.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {t('conductDeduction.mustTell')} <NotifyList parties={ledger.data.notify} />
              </p>
            )}

            {ledger.data.entries.length === 0 ? (
              <EmptyState icon={Undo2} title={t('conductDeduction.noEntries')} />
            ) : (
              <ul className="divide-y rounded-md border">
                {ledger.data.entries.map((entry) => (
                  <li key={entry.id} className="p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm">
                          <span className="font-medium">{entry.ruleCode}</span> · {entry.ruleNameLo}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(entry.date)}
                          {entry.note ? ` — ${entry.note}` : ''}
                        </p>
                      </div>
                      <span className="flex items-center gap-2">
                        <Badge variant="warning" className="tabular-nums">
                          −{entry.points}
                        </Badge>
                        {mayRevoke && revokingId !== entry.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setRevokingId(entry.id);
                              setReason('');
                            }}
                          >
                            <Undo2 />
                            {t('conductDeduction.revoke')}
                          </Button>
                        )}
                      </span>
                    </div>

                    {revokingId === entry.id && (
                      <div className="mt-2 space-y-1.5 rounded-md bg-muted/50 p-2">
                        <Label htmlFor={`revoke-${entry.id}`} className="text-xs">
                          {t('conductDeduction.revokeReason')}
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            id={`revoke-${entry.id}`}
                            value={reason}
                            autoFocus
                            placeholder={t('conductDeduction.revokeReasonPlaceholder')}
                            onChange={(event) => setReason(event.target.value)}
                          />
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={!reason.trim() || revoke.isPending}
                            onClick={() => confirmRevoke(entry.id)}
                          >
                            {t('common.confirm')}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setRevokingId(null)}>
                            {t('common.cancel')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
