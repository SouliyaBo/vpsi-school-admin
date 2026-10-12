import { Bell, BellOff, Check, ExternalLink, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useIssueTelegramCode,
  useTelegramStatus,
  useTestTelegram,
  useUnlinkTelegram,
  type TelegramLinkCode,
} from '../api';

/**
 * Connecting this account to the school's Telegram bot.
 *
 * The bot cannot tell who is writing to it — anybody can find it — so the person
 * carries a code from this screen, which they are already signed in to. The deep
 * link fills that code in for them, and the six digits are shown beside it for
 * the case where the link is opened on a machine with no Telegram installed.
 *
 * Deliberately on the profile page rather than in settings: linking is something
 * a teacher does for themselves once, not something the office configures.
 */
export function TelegramCard() {
  const { t } = useTranslation();
  const status = useTelegramStatus();
  const issue = useIssueTelegramCode();
  const unlink = useUnlinkTelegram();
  const test = useTestTelegram();

  const [issued, setIssued] = useState<TelegramLinkCode | null>(null);

  if (status.isLoading) {
    return (
      <Card>
        <CardContent className="space-y-2 pt-5">
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-9 w-40" />
        </CardContent>
      </Card>
    );
  }

  // Nothing to offer when the school has no bot: an inert button would be read
  // as a broken feature rather than one that has not been set up.
  if (!status.data?.available) return null;

  const linked = status.data.linked;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {linked ? <Bell className="size-4" aria-hidden /> : <BellOff className="size-4" aria-hidden />}
          {t('telegram.title')}
          {linked && (
            <Badge variant="success" className="ms-auto">
              {t('telegram.linked')}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-3">
        {linked ? (
          <>
            <p className="text-sm text-muted-foreground">
              {status.data.linkedAt
                ? t('telegram.linkedSince', { when: formatDateTime(status.data.linkedAt) })
                : t('telegram.linkedHint')}
            </p>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => test.mutate()}
                disabled={test.isPending}
              >
                <Send />
                {t('telegram.sendTest')}
              </Button>
              <Button
                variant="ghost"
                onClick={() => unlink.mutate()}
                disabled={unlink.isPending}
              >
                {t('telegram.unlink')}
              </Button>
            </div>

            {test.data && (
              <p className="text-xs text-muted-foreground">
                {test.data.sent ? (
                  <span className="inline-flex items-center gap-1 text-success">
                    <Check className="size-3" aria-hidden />
                    {t('telegram.testSent')}
                  </span>
                ) : (
                  t('telegram.testFailed')
                )}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">{t('telegram.whyLink')}</p>

            {issued ? (
              <div className="space-y-3">
                <ol className="list-decimal space-y-1 ps-5 text-sm">
                  <li>{t('telegram.step1')}</li>
                  <li>{t('telegram.step2')}</li>
                  <li>{t('telegram.step3')}</li>
                </ol>

                <div className="flex flex-wrap items-center gap-3">
                  {issued.deepLink && (
                    <Button asChild>
                      {/* `noreferrer` with `_blank`: the bot link leaves the app. */}
                      <a href={issued.deepLink} target="_blank" rel="noreferrer">
                        <ExternalLink />
                        {t('telegram.openBot')}
                      </a>
                    </Button>
                  )}
                  <div className="leading-tight">
                    <p className="text-xs text-muted-foreground">{t('telegram.orSendCode')}</p>
                    <p className="font-mono text-lg tabular-nums tracking-widest">
                      /start {issued.code}
                    </p>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t('telegram.codeExpires', { when: formatDateTime(issued.expiresAt) })}
                </p>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => status.refetch()}
                  disabled={status.isFetching}
                >
                  {t('telegram.checkAgain')}
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => issue.mutate(undefined, { onSuccess: setIssued })}
                disabled={issue.isPending}
              >
                <Bell />
                {t('telegram.connect')}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
