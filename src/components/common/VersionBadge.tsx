import { useTranslation } from 'react-i18next';
import { buildLabel, versionLabel } from '@/lib/build-info';
import { cn } from '@/lib/utils';

/**
 * Which build is on screen.
 *
 * Small and quiet by design: it is not information anybody uses while working,
 * only when answering "did my deploy actually go out?" and "what version are you
 * on?". So it sits where the eye lands last — under the login card, and at the
 * foot of the sidebar — and never competes with the page.
 *
 * The version is the visible part; the commit and build time live in the
 * tooltip, where they cost nothing until somebody needs them. `title` rather
 * than a styled popover on purpose: the string wants to be selectable and
 * copy-pasteable into a message, and the browser's own tooltip survives a
 * screenshot better than anything custom.
 */
export function VersionBadge({
  className,
  tone = 'muted',
}: {
  className?: string;
  /** `onPrimary` for the login screen, which sits on the brand colour. */
  tone?: 'muted' | 'onPrimary';
}) {
  const { t, i18n } = useTranslation();
  const detail = buildLabel(i18n.language);

  return (
    <p
      title={`${t('common.version')} ${detail}`}
      className={cn(
        'select-text text-[11px] tabular-nums',
        tone === 'onPrimary' ? 'text-primary-foreground/60' : 'text-sidebar-muted-foreground',
        className,
      )}
    >
      {versionLabel()}
    </p>
  );
}
