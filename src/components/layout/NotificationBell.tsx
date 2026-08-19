import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { get } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

/**
 * Unread badge in the topbar.
 *
 * Polls the count rather than the inbox itself — the endpoint is cheap, and the
 * notification list page (Phase 5) is where the items get rendered.
 */
export function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => get<{ count: number }>('/notifications/unread-count'),
    refetchInterval: 60_000,
    // A failure here must never surface as a toast on every page.
    retry: false,
  });

  const count = data?.count ?? 0;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="relative"
      aria-label={t('nav.notifications')}
      onClick={() => navigate('/notifications')}
    >
      <Bell />
      {count > 0 && (
        <span className="absolute -end-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-danger-foreground">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Button>
  );
}
