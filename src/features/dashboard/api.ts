import { useQueries, useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api-client';
import { cleanParams } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/common';
import type { Announcement, CalendarEvent, GradeLevel } from '@/types/entities';
import { STUDENT_STATUSES } from '@/types/enums';

/**
 * Dashboard reads.
 *
 * The API has no aggregate/statistics endpoint, so the totals here come from the
 * `meta.total` of a `limit=1` list query — one small request per figure instead
 * of downloading collections to count them client-side. Each is cached for a
 * minute, since none of these numbers changes by the second.
 */

const COUNT_STALE_TIME = 60_000;

async function countOf(path: string, params: Record<string, unknown> = {}): Promise<number> {
  const response = await get<PaginatedResponse<unknown>>(path, {
    params: cleanParams({ ...params, page: 1, limit: 1 }),
  });
  return response.meta.total;
}

export function useCount(scope: string, path: string, params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: ['dashboard', 'count', scope, params],
    queryFn: () => countOf(path, params),
    staleTime: COUNT_STALE_TIME,
  });
}

/** Student counts per grade level, for the distribution chart. */
export function useStudentsByGrade(gradeLevels: GradeLevel[] | undefined) {
  return useQueries({
    queries: (gradeLevels ?? []).map((level) => ({
      queryKey: ['dashboard', 'count', 'students', { gradeLevelId: level.id }],
      queryFn: () => countOf('/students', { gradeLevelId: level.id, status: 'active' }),
      staleTime: COUNT_STALE_TIME,
    })),
    combine: (results) => ({
      isLoading: results.some((result) => result.isLoading),
      data: (gradeLevels ?? []).map((level, index) => ({
        level,
        count: results[index]?.data ?? 0,
      })),
    }),
  });
}

/** Active/graduated/dropped… counts, for the status breakdown. */
export function useStudentsByStatus() {
  return useQueries({
    queries: STUDENT_STATUSES.map((status) => ({
      queryKey: ['dashboard', 'count', 'students', { status }],
      queryFn: () => countOf('/students', { status }),
      staleTime: COUNT_STALE_TIME,
    })),
    combine: (results) => ({
      isLoading: results.some((result) => result.isLoading),
      data: STUDENT_STATUSES.map((status, index) => ({
        status,
        count: results[index]?.data ?? 0,
      })),
    }),
  });
}

export function useGenderSplit() {
  return useQueries({
    queries: (['male', 'female'] as const).map((gender) => ({
      queryKey: ['dashboard', 'count', 'students', { gender }],
      queryFn: () => countOf('/students', { gender, status: 'active' }),
      staleTime: COUNT_STALE_TIME,
    })),
    combine: (results) => ({
      isLoading: results.some((result) => result.isLoading),
      male: results[0]?.data ?? 0,
      female: results[1]?.data ?? 0,
    }),
  });
}

export function useLatestAnnouncements(limit = 5) {
  return useQuery({
    queryKey: ['dashboard', 'announcements', limit],
    queryFn: () =>
      get<PaginatedResponse<Announcement>>('/announcements', {
        params: { page: 1, limit, sortBy: 'publishedAt', sortOrder: 'desc' },
      }),
    staleTime: COUNT_STALE_TIME,
    // A role without `announcements:read` gets a 403 here; the panel hides
    // itself rather than retrying.
    retry: false,
  });
}

/** Calendar entries for the current month — what "coming up" is drawn from. */
export function useUpcomingEvents() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  return useQuery({
    queryKey: ['dashboard', 'calendar', year, month],
    queryFn: () => get<CalendarEvent[]>(`/calendar/month/${year}/${month}`),
    staleTime: COUNT_STALE_TIME,
    retry: false,
  });
}
