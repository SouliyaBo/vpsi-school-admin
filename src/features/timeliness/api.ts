import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api-client';
import { cleanParams } from '@/lib/utils';

/**
 * ຄວາມຕົງເວລາໃນການບັນທຶກ — punctuality, over the same two logs as coverage.
 *
 * A different question from `features/coverage`, and the reason it is a different
 * screen: coverage asks whether a lesson was written up, and a teacher who writes
 * up a fortnight of lessons on one Friday afternoon satisfies it completely. This
 * one asks when, against the deadline the school set — noon of the next working
 * day after the lesson.
 *
 * Both endpoints are gated on `manage` server-side, which is the administrator
 * and the head of academic affairs: the report names and ranks staff.
 */

export type TimelinessKind = 'attendance' | 'behavior';

const ENDPOINTS: Record<TimelinessKind, string> = {
  attendance: '/attendances/timeliness',
  behavior: '/behavior-logs/timeliness',
};

/** A lesson day filed past its deadline, and by how much. */
export interface LateLesson {
  date: string;
  /** Hours past noon of the next working day. */
  hoursLate: number;
  classroomName: string;
  gradeLevelCode: string | null;
  subjectNameLo: string;
}

export interface TimelinessRow {
  teacherId: string;
  teacherCode: string | null;
  teacherName: string;
  /** Lesson days the timetable owed; `null` for the behaviour register. */
  owed: number | null;
  recorded: number;
  onTime: number;
  late: number;
  /** Owed and never written; `null` for the behaviour register — nothing is owed. */
  missing: number | null;
  /** `late / (onTime + late)`, 0–100. */
  lateRate: number;
  avgHoursLate: number;
  worstHoursLate: number;
  /** Written, but too recently for the deadline to have passed. */
  notYetDue: number;
  lastRecordedAt: string | null;
  lateLessons: LateLesson[];
  missingDates: string[];
}

export interface TimelinessSummary {
  owed: number | null;
  recorded: number;
  onTime: number;
  late: number;
  missing: number | null;
  notYetDue: number;
  lateRate: number;
  avgHoursLate: number;
  teachersLate: number;
  /** Lessons the calendar could give no deadline for — see the API. */
  unjudged: number;
}

export interface RecordTimeliness {
  startDate: string;
  endDate: string;
  asOf: string;
  /** The last lesson day whose deadline has passed; anything later is unjudged. */
  judgedThrough: string | null;
  rule: 'everyLessonDay' | 'entriesOnly';
  semester: { id: string; nameLo: string; nameEn: string | null } | null;
  rows: TimelinessRow[];
  summary: TimelinessSummary;
}

/** `Record` so `cleanParams` can walk it. */
export interface TimelinessParams extends Record<string, unknown> {
  from?: string;
  to?: string;
  semesterId?: string;
  teacherId?: string;
  classroomId?: string;
}

export const timelinessApi = {
  read: (kind: TimelinessKind, params: TimelinessParams = {}) =>
    get<RecordTimeliness>(ENDPOINTS[kind], { params: cleanParams(params) }),
};

export function useTimeliness(kind: TimelinessKind, params: TimelinessParams) {
  return useQuery({
    queryKey: ['timeliness', kind, params],
    queryFn: () => timelinessApi.read(kind, params),
    // Keeps the previous range on screen while the next loads, so moving the
    // date bounds does not blank the table on every keystroke.
    placeholderData: (previous) => previous,
  });
}

/**
 * `2 ວັນ 5 ຊົ່ວໂມງ` — lateness said the way it is spoken about.
 *
 * Hours alone stop being readable somewhere around a day: `144.8` is the report's
 * worst case and nobody reads it as six days without doing the division. The
 * translator is passed in so this stays a formatter and not a second catalogue.
 */
export function lateness(
  hours: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  if (hours <= 0) return '—';
  if (hours < 24) return t('timeliness.hours', { count: Math.round(hours * 10) / 10 });
  const days = Math.floor(hours / 24);
  const rest = Math.round(hours - days * 24);
  if (rest === 0) return t('timeliness.days', { count: days });
  return `${t('timeliness.days', { count: days })} ${t('timeliness.hours', { count: rest })}`;
}
