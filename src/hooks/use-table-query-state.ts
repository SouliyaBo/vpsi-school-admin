import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { PaginationQuery } from '@/types/common';

export interface TableQueryState extends PaginationQuery {
  /** Every filter the page defines, e.g. `{ status: 'active', classroomId: '…' }`. */
  filters: Record<string, string>;
}

interface Options {
  defaultLimit?: number;
  defaultSortBy?: string;
  defaultSortOrder?: 'asc' | 'desc';
  /** Filter names this table understands; anything else in the URL is ignored. */
  filterKeys?: readonly string[];
}

const RESERVED = ['page', 'limit', 'sortBy', 'sortOrder', 'search'];

/**
 * Table state (page, sort, search, filters) held in the URL.
 *
 * Keeping it there rather than in component state means a filtered list is
 * linkable and survives a reload or a back-navigation from a detail page —
 * which matters when someone is working through a long roster.
 */
export function useTableQueryState(options: Options = {}) {
  const {
    defaultLimit = 20,
    defaultSortBy,
    defaultSortOrder = 'desc',
    filterKeys = [],
  } = options;
  const [searchParams, setSearchParams] = useSearchParams();

  const state = useMemo<TableQueryState>(() => {
    const filters: Record<string, string> = {};
    for (const key of filterKeys) {
      const value = searchParams.get(key);
      if (value) filters[key] = value;
    }

    return {
      page: Number(searchParams.get('page')) || 1,
      limit: Number(searchParams.get('limit')) || defaultLimit,
      sortBy: searchParams.get('sortBy') ?? defaultSortBy,
      sortOrder: (searchParams.get('sortOrder') as 'asc' | 'desc') ?? defaultSortOrder,
      search: searchParams.get('search') ?? '',
      filters,
    };
  }, [searchParams, filterKeys, defaultLimit, defaultSortBy, defaultSortOrder]);

  const patch = useCallback(
    (next: Partial<TableQueryState>) => {
      setSearchParams(
        (previous) => {
          const params = new URLSearchParams(previous);

          for (const key of RESERVED) {
            if (!(key in next)) continue;
            const value = next[key as keyof PaginationQuery];
            if (value === undefined || value === null || value === '') params.delete(key);
            else params.set(key, String(value));
          }

          if (next.filters) {
            for (const key of filterKeys) {
              const value = next.filters[key];
              if (!value) params.delete(key);
              else params.set(key, value);
            }
          }

          // Any change other than paging invalidates the current page number —
          // page 4 of an unfiltered list is rarely page 4 of a filtered one.
          if (!('page' in next)) params.delete('page');

          return params;
        },
        { replace: true },
      );
    },
    [setSearchParams, filterKeys],
  );

  const setPage = useCallback((page: number) => patch({ page }), [patch]);
  const setLimit = useCallback((limit: number) => patch({ limit }), [patch]);
  const setSearch = useCallback((search: string) => patch({ search }), [patch]);
  const setFilter = useCallback(
    (key: string, value: string | undefined) => patch({ filters: { [key]: value ?? '' } }),
    [patch],
  );

  const setSort = useCallback(
    (sortBy: string) => {
      // Third click on the same column clears the sort and returns to the
      // server's default ordering.
      if (state.sortBy !== sortBy) return patch({ sortBy, sortOrder: 'asc' });
      if (state.sortOrder === 'asc') return patch({ sortBy, sortOrder: 'desc' });
      return patch({ sortBy: undefined, sortOrder: undefined });
    },
    [patch, state.sortBy, state.sortOrder],
  );

  const clearFilters = useCallback(() => {
    setSearchParams(new URLSearchParams(), { replace: true });
  }, [setSearchParams]);

  const hasActiveFilters = Boolean(state.search) || Object.keys(state.filters).length > 0;

  /** Params for the API call — `filters` flattened, empties dropped. */
  const queryParams = useMemo(
    () => ({
      page: state.page,
      limit: state.limit,
      ...(state.sortBy ? { sortBy: state.sortBy, sortOrder: state.sortOrder } : {}),
      ...(state.search ? { search: state.search } : {}),
      ...state.filters,
    }),
    [state],
  );

  return {
    ...state,
    queryParams,
    hasActiveFilters,
    patch,
    setPage,
    setLimit,
    setSearch,
    setSort,
    setFilter,
    clearFilters,
  };
}
