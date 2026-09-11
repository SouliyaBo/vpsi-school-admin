import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api-client';
import { createCrudApi, createCrudHooks } from '@/lib/crud';
import type { CalendarEvent, SchoolDay } from '@/types/entities';
import type { CalendarEventType, SchoolDayEffect } from '@/types/enums';

export interface CalendarEventInput {
  titleLo: string;
  titleEn?: string;
  description?: string;
  type: CalendarEventType;
  dayEffect: SchoolDayEffect;
  startDate: string;
  endDate: string;
  isHalfDay?: boolean;
  location?: string;
}

export const calendarApi = {
  ...createCrudApi<CalendarEvent, CalendarEventInput>('/calendar'),
  /**
   * Every day of a range as the school works it.
   *
   * The grid paints this rather than deriving the states from the event list: a
   * day's state depends on which of several overlapping events is the most
   * restrictive, and that rule lives on the API next to the reports that count
   * against it.
   */
  schoolDays: (from: string, to: string) =>
    get<SchoolDay[]>('/calendar/school-days', { params: { from, to } }),
};

export const calendarEvents = createCrudHooks<CalendarEvent, CalendarEventInput>(
  'calendar',
  calendarApi,
);

/** The classified days of a range, keyed for the grid to look up by `yyyy-MM-dd`. */
export function useSchoolDays(from: string, to: string) {
  return useQuery({
    queryKey: ['calendar', 'school-days', from, to],
    queryFn: async () => {
      const days = await calendarApi.schoolDays(from, to);
      return new Map(days.map((day) => [day.date, day]));
    },
    staleTime: 60_000,
  });
}
