import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import { del, get, patch, post } from './api-client';
import { cleanParams } from './utils';
import type { PaginatedResponse } from '@/types/common';

/**
 * Factories for the CRUD surface every master-data module shares.
 *
 * Nine modules expose the same five endpoints with the same pagination
 * contract; writing `useTeachers`, `useSubjects`, `useClassrooms` … by hand
 * would be nine copies of identical query-key and invalidation logic, and the
 * one that gets it wrong is the one that silently shows stale rows after a save.
 *
 * A module that needs more than CRUD (activate, close, photo upload, roster)
 * adds those calls to its own `api.ts` alongside the generated ones.
 */

export interface ListParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

export interface CrudApi<TEntity, TCreate, TUpdate> {
  list: (params?: ListParams) => Promise<PaginatedResponse<TEntity>>;
  byId: (id: string) => Promise<TEntity>;
  create: (body: TCreate) => Promise<TEntity>;
  update: (id: string, body: TUpdate) => Promise<TEntity>;
  remove: (id: string) => Promise<void>;
}

/** `path` is the resource segment, e.g. `/teachers`. */
export function createCrudApi<TEntity, TCreate, TUpdate = Partial<TCreate>>(
  path: string,
): CrudApi<TEntity, TCreate, TUpdate> {
  return {
    list: (params = {}) =>
      get<PaginatedResponse<TEntity>>(path, { params: cleanParams(params) }),
    byId: (id) => get<TEntity>(`${path}/${id}`),
    create: (body) => post<TEntity>(path, body),
    update: (id, body) => patch<TEntity>(`${path}/${id}`, body),
    remove: (id) => del<void>(`${path}/${id}`),
  };
}

export function crudKeys(scope: string) {
  return {
    all: [scope] as const,
    list: (params?: ListParams) => [scope, 'list', params ?? {}] as const,
    detail: (id: string | undefined) => [scope, 'detail', id] as const,
  };
}

interface CrudHookOptions {
  /** i18n keys toasted by the global mutation handlers. */
  messages?: {
    created?: string;
    updated?: string;
    deleted?: string;
  };
}

export function createCrudHooks<TEntity, TCreate, TUpdate = Partial<TCreate>>(
  scope: string,
  api: CrudApi<TEntity, TCreate, TUpdate>,
  options: CrudHookOptions = {},
) {
  const keys = crudKeys(scope);
  const messages = {
    created: 'toast.created',
    updated: 'toast.updated',
    deleted: 'toast.deleted',
    ...options.messages,
  };

  function useList(
    params: ListParams,
    queryOptions?: Partial<UseQueryOptions<PaginatedResponse<TEntity>>>,
  ) {
    return useQuery({
      queryKey: keys.list(params),
      queryFn: () => api.list(params),
      // Paging through a roster should not flash an empty table between pages.
      placeholderData: (previous) => previous,
      ...queryOptions,
    });
  }

  function useDetail(id: string | undefined, queryOptions?: Partial<UseQueryOptions<TEntity>>) {
    return useQuery({
      queryKey: keys.detail(id),
      queryFn: () => api.byId(id!),
      enabled: Boolean(id),
      ...queryOptions,
    });
  }

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (body: TCreate) => api.create(body),
      meta: { successMessage: messages.created },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
    });
  }

  function useUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: ({ id, body }: { id: string; body: TUpdate }) => api.update(id, body),
      meta: { successMessage: messages.updated },
      onSuccess: (_data, variables) => {
        void queryClient.invalidateQueries({ queryKey: keys.all });
        void queryClient.invalidateQueries({ queryKey: keys.detail(variables.id) });
      },
    });
  }

  function useDelete() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: (id: string) => api.remove(id),
      meta: { successMessage: messages.deleted },
      onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
    });
  }

  return { keys, useList, useDetail, useCreate, useUpdate, useDelete };
}

/**
 * Small paged read used to fill a picker's dropdown.
 *
 * `limit` is deliberately low: the list is searched server-side as the user
 * types, so pulling more rows would only slow the first paint.
 */
export function useLookupQuery<TEntity>(
  scope: string,
  fetcher: (params: ListParams) => Promise<PaginatedResponse<TEntity>>,
  search: string,
  extraParams: ListParams = {},
  limit = 20,
) {
  return useQuery({
    queryKey: [scope, 'lookup', search, extraParams, limit],
    queryFn: () => fetcher({ search, limit, page: 1, ...extraParams }),
    staleTime: 60_000,
  });
}
