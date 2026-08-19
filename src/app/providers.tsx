import { QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/i18n';
import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/features/auth/store';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/sonner';
import { ErrorBoundary } from './ErrorBoundary';

/**
 * Exchanges the stored refresh token for a live session on first mount.
 *
 * Runs once, before the router renders anything that depends on auth state —
 * `RequireAuth` holds the UI on a spinner while `status` is `restoring`.
 */
function SessionRestorer({ children }: { children: ReactNode }) {
  useEffect(() => {
    void useAuthStore.getState().restore();
  }, []);

  return <>{children}</>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider delayDuration={300}>
            <SessionRestorer>{children}</SessionRestorer>
            <Toaster />
          </TooltipProvider>
        </QueryClientProvider>
      </I18nextProvider>
    </ErrorBoundary>
  );
}
