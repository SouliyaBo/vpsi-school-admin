import { Loader2, ShieldOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/features/auth/store';
import { satisfies, type PermissionCheck } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';

/** Full-screen spinner shown while the stored session is being restored. */
function SessionLoading() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-muted">
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden />
      <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
    </div>
  );
}

/**
 * Gate for everything behind sign-in.
 *
 * `idle`/`restoring` must render neither the app nor a redirect: on a reload the
 * refresh token has not been exchanged yet, and bouncing to /login here would
 * sign the user out on every refresh.
 */
export function RequireAuth() {
  const status = useAuthStore((state) => state.status);
  const user = useAuthStore((state) => state.user);
  const location = useLocation();

  if (status === 'idle' || status === 'restoring') return <SessionLoading />;

  if (status !== 'authenticated' || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  // A temporary password blocks the rest of the app until it is replaced.
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  return <Outlet />;
}

/** Keeps a signed-in user off /login and the other public screens. */
export function RequireAnonymous() {
  const status = useAuthStore((state) => state.status);

  if (status === 'idle' || status === 'restoring') return <SessionLoading />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <Outlet />;
}

/**
 * Permission gate for a route subtree.
 *
 * This only decides what to *render*; the API enforces the same matrix on every
 * request, so a hand-typed URL cannot reach data the role does not allow.
 */
export function RequirePermission({
  check,
  children,
}: {
  check: PermissionCheck | PermissionCheck[];
  children?: ReactNode;
}) {
  const user = useAuthStore((state) => state.user);

  if (!satisfies(user?.permissions, check)) return <NoAccess />;
  return children ? <>{children}</> : <Outlet />;
}

export function NoAccess() {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon={ShieldOff}
      title={t('auth.noAccess')}
      description={t('auth.noAccessHint')}
      action={
        <Button variant="outline" size="sm" onClick={() => window.history.back()}>
          {t('common.back')}
        </Button>
      }
    />
  );
}
