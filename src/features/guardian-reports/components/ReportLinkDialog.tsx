import { AlertTriangle, Check, Copy, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { guardianReportLink, type IssuedGuardianReport } from '../api';
import { isInsecureOrigin, phoneLastDigits, whatsappLink } from '../lib/report-link';

/**
 * The one moment a report's link exists on a screen.
 *
 * The server keeps only the token's hash, so closing this without copying means
 * reissuing — the dialog says so, and offers the two ways a teacher here
 * actually sends things: paste into a chat, or straight into WhatsApp.
 *
 * The message is always written in Lao, whatever language the teacher's screen
 * is in: it is addressed to the family.
 */
export function ReportLinkDialog({
  issued,
  guardianPhone,
  onClose,
}: {
  issued: IssuedGuardianReport | null;
  guardianPhone: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (!issued) return null;

  const { report, token } = issued;
  const link = guardianReportLink(token);
  const text = t('guardianReport.shareText', {
    lng: 'lo',
    name: report.snapshot.guardian.nameLo,
    month: t(`month.${report.month}`, { lng: 'lo' }),
    student: report.snapshot.student.nameLo,
    link,
    expires: formatDate(report.expiresAt),
  });
  const digits = phoneLastDigits(guardianPhone);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // No clipboard permission: the text is in the box below, selectable by hand.
      setCopied(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          setCopied(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('guardianReport.linkTitle')}</DialogTitle>
          <DialogDescription>{t('guardianReport.linkOnce')}</DialogDescription>
        </DialogHeader>

        {isInsecureOrigin() && (
          <p className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t('guardianReport.httpWarning')}
          </p>
        )}

        <Textarea
          readOnly
          value={text}
          rows={5}
          aria-label={t('guardianReport.linkTitle')}
          onFocus={(event) => event.currentTarget.select()}
        />
        {digits && (
          <p className="text-sm text-muted-foreground">{t('guardianReport.pinHint', { digits })}</p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={copy}>
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? t('guardianReport.copied') : t('guardianReport.copy')}
          </Button>
          <Button asChild>
            <a href={whatsappLink(guardianPhone, text)} target="_blank" rel="noopener noreferrer">
              <MessageCircle aria-hidden />
              {t('guardianReport.whatsapp')}
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
