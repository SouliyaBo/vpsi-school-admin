import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import i18n from '@/i18n';
import { Toaster } from '@/components/ui/sonner';

/**
 * Renders a component inside the providers it can assume in the app: i18n (labels
 * come from the catalogue), a router (table state lives in the URL), a fresh
 * QueryClient per test so cached data cannot leak between them, and the toast host
 * — without which any notification the component raises has nowhere to render.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      // Retries would make a deliberate failure case take three attempts.
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <I18nextProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
          <Toaster />
        </QueryClientProvider>
      </I18nextProvider>
    );
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}

/** A `PaginatedResponse` envelope around fixture rows. */
export function paginated<T>(data: T[], overrides: Partial<{ page: number; limit: number; total: number }> = {}) {
  const page = overrides.page ?? 1;
  const limit = overrides.limit ?? 20;
  const total = overrides.total ?? data.length;
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 0;

  return {
    data,
    meta: {
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    },
  };
}
