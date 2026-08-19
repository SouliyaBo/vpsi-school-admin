import type { SchedulePeriod, TeachingAssignment } from '@/types/entities';

/**
 * Reading a timetable out of the assignment documents.
 *
 * The API stores the week the way it is *written* — one assignment holding the
 * periods it occupies — while a timetable is read the other way round: by day,
 * then by time. These helpers do that inversion, and are shared by the teacher
 * and classroom views so both grids order and label days identically.
 */

/** Index 0 = Sunday … 6 = Saturday, matching `dayOfWeek` and `Date#getDay()`. */
const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Monday-first, the order a Lao school week is read. */
const SCHOOL_WEEK = [1, 2, 3, 4, 5, 6];

/** i18n key under `weekday.` for a `dayOfWeek` value. */
export function weekdayKey(dayOfWeek: number): string {
  return `weekday.${WEEKDAY_KEYS[dayOfWeek] ?? 'sun'}`;
}

/** Options for the day picker, in the order the week is read. */
export const DAY_ORDER = [...SCHOOL_WEEK, 0];

/** One cell of the grid: a period, and the assignment it belongs to. */
export interface TimetableEntry {
  assignment: TeachingAssignment;
  period: SchedulePeriod;
}

export function toTimetableEntries(assignments: TeachingAssignment[]): TimetableEntry[] {
  return assignments.flatMap((assignment) =>
    assignment.schedule.map((period) => ({ assignment, period })),
  );
}

/**
 * Which columns to draw: Monday–Saturday always, so an empty day still reads as
 * a free day rather than vanishing, plus Sunday only when something is on it.
 */
export function visibleDays(entries: TimetableEntry[]): number[] {
  const hasSunday = entries.some((entry) => entry.period.dayOfWeek === 0);
  return hasSunday ? DAY_ORDER : SCHOOL_WEEK;
}

/** Entries for one day, earliest first. `HH:mm` sorts chronologically as text. */
export function entriesForDay(entries: TimetableEntry[], dayOfWeek: number): TimetableEntry[] {
  return entries
    .filter((entry) => entry.period.dayOfWeek === dayOfWeek)
    .sort((a, b) => a.period.startTime.localeCompare(b.period.startTime));
}

export function formatPeriodTime(period: SchedulePeriod): string {
  return `${period.startTime}–${period.endTime}`;
}

/** Total periods a week, across every assignment shown. */
export function countPeriods(assignments: TeachingAssignment[]): number {
  return assignments.reduce((total, assignment) => total + assignment.schedule.length, 0);
}

/** Same-day time overlap, with the API's strict inequalities: back-to-back is fine. */
export function periodsOverlap(a: SchedulePeriod, b: SchedulePeriod): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  return a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * The other lessons a swap slot alternates with.
 *
 * A swap is only recorded as several ordinary entries that happen to share an
 * hour; nothing links them. They are found the same way the API decides not to
 * call them a clash — same hour, both marked — so the two always agree on what
 * belongs to a slot.
 *
 * What the partner *means* depends on the week being read, so this returns the
 * entries and lets the caller name them: on a teacher's week the partner is the
 * other class they alternate between, on a class's week it is the other subject
 * the hour alternates with.
 *
 * A partner outside the week on screen cannot be found, and none is reported
 * rather than guessed at.
 */
export function rotationPartners(
  entries: TimetableEntry[],
  entry: TimetableEntry,
): TimetableEntry[] {
  if (!entry.period.isRotating) return [];

  return entries.filter(
    (other) =>
      other !== entry &&
      other.period.isRotating === true &&
      periodsOverlap(other.period, entry.period),
  );
}
