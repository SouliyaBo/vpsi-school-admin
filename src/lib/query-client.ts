import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import i18next from 'i18next';
import { ApiError } from './api-error';
import { notify } from './toast';

/**
 * A failed *query* renders an error state in place (each page has one), so it
 * does not also raise a toast — that would double-report. A failed *mutation*
 * has no such surface, so it toasts unless the caller opts out with
 * `meta: { silentError: true }`.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: (failureCount, error) => {
        // Never retry a request the server actively rejected — a 403 or a
        // validation error will fail identically every time.
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Surface background refetch failures that no error state will show
      // (the page is still displaying stale data).
      if (query.state.data !== undefined) notify.error(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silentError) return;
      notify.error(error);
    },
    onSuccess: (_data, _variables, _context, mutation) => {
      const key = mutation.meta?.successMessage;
      if (typeof key === 'string') notify.success(i18next.t(key));
    },
  }),
});
