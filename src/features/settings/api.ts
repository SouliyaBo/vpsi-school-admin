import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, put } from '@/lib/api-client';
import type { Setting } from '@/types/entities';

/**
 * The settings catalogue is keyed by a dotted string, not by an id, and is
 * written with `PUT /settings` (an upsert) rather than POST/PATCH — so it does
 * not fit `createCrudApi`, and its calls are spelled out here.
 *
 * The list is short (two dozen rows) and unpaginated: the endpoint returns the
 * whole array sorted by category then key.
 */

export interface SettingInput {
  key: string;
  value: unknown;
  category?: string;
  description?: string;
  isPublic?: boolean;
}

export const settingsApi = {
  list: (category?: string) =>
    get<Setting[]>('/settings', { params: category ? { category } : undefined }),
  byKey: (key: string) => get<Setting>(`/settings/${key}`),
  upsert: (body: SettingInput) => put<Setting>('/settings', body),
  remove: (key: string) => del<void>(`/settings/${encodeURIComponent(key)}`),
};

export const settingsKeys = {
  all: ['settings'] as const,
  list: (category?: string) => ['settings', 'list', category ?? null] as const,
};

export function useSettings(category?: string) {
  return useQuery({
    queryKey: settingsKeys.list(category),
    queryFn: () => settingsApi.list(category),
    // Settings change rarely and are read on every page load of this screen.
    staleTime: 60_000,
  });
}

/**
 * Saves several settings in one user action.
 *
 * The API has no bulk endpoint, so the edits are sent one at a time and
 * **sequentially**: each `PUT` writes an audit entry and busts the server-side
 * cache for its own key, and a burst of parallel writes has produced
 * out-of-order audit rows in this codebase before. A dozen writes is well
 * within the time a Save click can wait.
 */
export function useSaveSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entries: SettingInput[]) => {
      const saved: Setting[] = [];
      for (const entry of entries) saved.push(await settingsApi.upsert(entry));
      return saved;
    },
    meta: { successMessage: 'toast.updated' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
    // A partial failure leaves the server ahead of the cached list, so refetch
    // either way rather than trusting the local drafts.
    onError: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
}

export function useDeleteSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (key: string) => settingsApi.remove(key),
    meta: { successMessage: 'toast.deleted' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
  });
}
