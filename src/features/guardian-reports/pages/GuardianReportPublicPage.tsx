import { useMutation } from '@tanstack/react-query';
import { AlertCircle, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { toApiError } from '@/lib/api-error';
import { errorMessage } from '@/lib/error-message';
import { formatDate } from '@/lib/utils';
import { AuthLayout } from '@/features/auth/components/AuthLayout';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { guardianReportsApi, type OpenedGuardianReport } from '../api';
import { GuardianReportView } from '../components/GuardianReportView';
import { tokenFromHash } from '../lib/report-link';

/** Errors after which another guess cannot help, so the form goes away. */
const FINAL = new Set(['guardianReport.unavailable', 'guardianReport.locked']);

/**
 * `/r#<token>` — where a guardian lands from the message the teacher sent.
 *
 * No account and no session. The token is read from the fragment, which the
 * browser never sends to any server, and posted with the four phone digits in
 * the request body. Nothing is stored in the browser: closing the tab is the
 * whole of signing out.
 */
export function GuardianReportPublicPage() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const token = tokenFromHash(hash);
  const [pin, setPin] = useState('');

  useNoIndex();

  const open = useMutation({
    mutationFn: () => guardianReportsApi.open(token!, pin),
    meta: { silentError: true },
  });

  if (open.data) return <ReportShell opened={open.data} />;

  if (!token) {
    return (
      <AuthLayout title={t('guardianReport.publicTitle')}>
        <Problem>{t('guardianReport.noToken')}</Problem>
      </AuthLayout>
    );
  }

  const failure = open.error ? toApiError(open.error) : null;
  const final = failure?.messageKey ? FINAL.has(failure.messageKey) : false;
  const failureText =
    failure?.messageKey === 'guardianReport.wrongPin'
      ? t('guardianReport.pinWrong', {
          count: (failure.details as { attemptsLeft?: number } | undefined)?.attemptsLeft ?? 0,
        })
      : open.error
        ? errorMessage(open.error)
        : null;

  return (
    <AuthLayout title={t('guardianReport.publicTitle')} description={t('guardianReport.pinPrompt')}>
      {failureText && <Problem>{failureText}</Problem>}
      {!final && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (pin.length === 4) open.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="guardian-pin">{t('guardianReport.pinLabel')}</Label>
            <Input
              id="guardian-pin"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              className="text-center text-2xl tracking-[0.5em]"
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 4))}
              autoFocus
            />
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={pin.length !== 4}
            loading={open.isPending}
          >
            {t('guardianReport.open')}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}

function ReportShell({ opened }: { opened: OpenedGuardianReport }) {
  const { t } = useTranslation();
  const { report } = opened;

  return (
    <div className="min-h-dvh bg-muted">
      <div className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold">{opened.schoolNameLo}</p>
          <LocaleSwitcher />
        </div>
        <Card>
          <CardContent className="pt-5">
            <GuardianReportView
              content={report}
              sections={report.sections}
              message={report.message}
              guardian={report.guardian}
            />
          </CardContent>
        </Card>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {t('guardianReport.privacy')}{' '}
            {t('guardianReport.validUntil', { date: formatDate(opened.expiresAt) })}
          </span>
        </p>
      </div>
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
    >
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

/**
 * Keeps this page out of search engines and keeps its address out of the
 * `Referer` of any link followed from it — the fragment is not sent in a
 * referrer anyway, but nothing about the visit needs to be.
 */
function useNoIndex() {
  useEffect(() => {
    const tags = [
      Object.assign(document.createElement('meta'), {
        name: 'robots',
        content: 'noindex, nofollow',
      }),
      Object.assign(document.createElement('meta'), { name: 'referrer', content: 'no-referrer' }),
    ];
    tags.forEach((tag) => document.head.appendChild(tag));
    return () => tags.forEach((tag) => tag.remove());
  }, []);
}
