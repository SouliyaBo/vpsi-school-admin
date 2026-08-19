import '@tanstack/react-query';

/**
 * Typed `meta` for mutations, read by the global mutation cache handlers in
 * `lib/query-client.ts`.
 */
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: {
      /** i18n key toasted on success, e.g. `toast.created`. */
      successMessage?: string;
      /** Set when the caller handles the error itself (inline field errors). */
      silentError?: boolean;
    };
    queryMeta: Record<string, unknown>;
  }
}
