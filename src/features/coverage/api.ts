import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api-client';
import { qualifyClassName } from '@/features/homeroom-reviews/api';
import { cleanParams } from '@/lib/utils';

/**
 * "Who has not filled this in" — one report, over two logs.
 *
 * The behaviour register and the roll call ask the same question of the same
 * timetable: which lesson has nothing on file. The API answers both in the same
 * shape from the same engine, differing in one rule — a behaviour note is owed
 * once per window, a roll call once per lesson day — so the screen is one screen
 * and this is one client.
 */

/** Which log is being chased. */
export type CoverageKind = 'behavior' | 'attendance';

const ENDPOINTS: Record<CoverageKind, string> = {
  behavior: '/behavior-logs/weekly-coverage',
  attendance: '/attendances/coverage',
};

export type CoverageStatus = 'recorded' | 'missing' | 'not_yet';

/** How wide the report was read — one date, or the Monday–Sunday around it. */
export type CoverageScope = 'day' | 'week';

export interface CoverageRow {
  teachingAssignmentId: string;
  teacherId: string;
  teacherCode: string | null;
  teacherName: string;
  subjectId: string;
  subjectCode: string | null;
  subjectNameLo: string;
  subjectNameEn: string | null;
  classroomId: string;
  classroomName: string;
  /** `ມ.1` — the grade, so a row reads as the school says it. */
  gradeLevelCode: string | null;
  /** Timetabled periods across the whole window. */
  lessonsTimetabled: number;
  /** Of those, the ones already taught. */
  lessonsElapsed: number;
  /** `yyyy-MM-dd` of each day those elapsed lessons fall on. */
  lessonDates: string[];
  /** Of those days, the ones with nothing written — the days to chase. */
  missingDates: string[];
  /** Entries made in the window: register rows, or roll calls taken. */
  entries: number;
  studentsNoted: number;
  lastDate: string | null;
  status: CoverageStatus;
  /**
   * This row is a stand-in's share of somebody else's lesson.
   *
   * A covered lesson comes back as two rows, not one relabelled row: the days each
   * teacher was responsible for, under their own name. So `teachingAssignmentId` is
   * no longer unique across `rows` — a React key built on it alone will collide.
   */
  isSubstitute?: boolean;
  /** The timetabled teacher this row covers for; absent on an ordinary row. */
  coveringForTeacherName?: string | null;
}

export interface CoverageSummary {
  /** Lessons that owe something in the window — `not_yet` excluded. */
  expected: number;
  recorded: number;
  missing: number;
  notYet: number;
  /** `recorded / expected`, 0–100. */
  coverageRate: number;
  teachersMissing: number;
  classroomsMissing: number;
}

/**
 * The register read the other way round.
 *
 * Every other read starts from records that exist, so none of them can show the
 * lesson nobody wrote about. This one starts from the timetable, which is what
 * makes a gap visible at all.
 */
export interface LessonCoverage {
  /** `day` for a single date, `week` for Monday–Sunday. */
  scope: CoverageScope;
  /** The window's inclusive bounds; the same date twice when `scope` is `day`. */
  startDate: string;
  endDate: string;
  /** The day the window is measured up to — today, or its end once past. */
  asOf: string;
  semester: { id: string; nameLo: string; nameEn: string | null } | null;
  rows: CoverageRow[];
  /** Always the whole window, even when `rows` was narrowed to the gaps. */
  summary: CoverageSummary;
}

/** The signed-in teacher's own week; `teacherId` is `null` for an office account. */
export interface MyLessonCoverage extends LessonCoverage {
  teacherId: string | null;
}

/** `Record` so `cleanParams` can walk it. */
export interface CoverageParams extends Record<string, unknown> {
  /** Any day of the week to report on. */
  weekOf?: string;
  /**
   * One single day, in place of the week. A week's totals cannot say who wrote
   * nothing *on Monday* — an entry made on Tuesday counts towards the same week.
   */
  date?: string;
  semesterId?: string;
  classroomId?: string;
  teacherId?: string;
  /** Narrows the rows to the gaps; the summary still counts the whole window. */
  outstandingOnly?: boolean;
}

export const coverageApi = {
  read: (kind: CoverageKind, params: CoverageParams = {}) =>
    get<LessonCoverage>(ENDPOINTS[kind], { params: cleanParams(params) }),
};

/**
 * Who wrote nothing — the oversight read.
 *
 * Gated on `manage` server-side, which is the administrator and the head of
 * academic affairs: it reports on other people's work, so the screen that shows
 * it is gated the same way rather than trusted to hide itself.
 */
export function useCoverage(kind: CoverageKind, params: CoverageParams) {
  return useQuery({
    queryKey: ['coverage', kind, params],
    queryFn: () => coverageApi.read(kind, params),
    // Keeps the previous window on screen while the next one loads, so paging
    // back through the term does not blank the table on every click.
    placeholderData: (previous) => previous,
  });
}

/**
 * `ມ.1/ກ` — the class, as the school writes it.
 *
 * The prefix used to be unconditional, which read as `m1/ມ.1/ກ` on every row of
 * both reports: a room's own name already carries its grade here, and the grade's
 * code is latin while the name is Lao. `qualifyClassName` is shared with the
 * homeroom review, which labels the same rooms.
 */
export function classLabel(row: Pick<CoverageRow, 'classroomName' | 'gradeLevelCode'>): string {
  return qualifyClassName(row.classroomName, row.gradeLevelCode);
}

export function subjectLabel(
  row: Pick<CoverageRow, 'subjectNameLo' | 'subjectNameEn'>,
  locale: string,
): string {
  return locale === 'en' ? row.subjectNameEn || row.subjectNameLo : row.subjectNameLo;
}
