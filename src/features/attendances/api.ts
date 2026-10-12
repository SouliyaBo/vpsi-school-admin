import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import type { ListParams } from '@/lib/crud';
import { cleanParams } from '@/lib/utils';
import { MAX_PAGE_SIZE, type PaginatedResponse } from '@/types/common';
import type { Attendance, Subject, Teacher } from '@/types/entities';
import type { AttendanceStatus } from '@/types/enums';

/**
 * Attendance is not a CRUD resource, so it does not use `createCrudApi`.
 *
 * There is no per-record create or update: a roll call is submitted for one
 * lesson at a time and the API upserts on (student, date, lesson), which makes
 * re-submitting a corrected sheet an edit rather than a duplicate. The reads are
 * shaped for their own screens — a sheet, a log and two summaries — rather than
 * being one list endpoint bent four ways.
 */

export interface AttendanceListParams extends ListParams {
  studentId?: string;
  classroomId?: string;
  semesterId?: string;
  subjectId?: string;
  teacherId?: string;
  teachingAssignmentId?: string;
  status?: AttendanceStatus;
  /** Everything but `present` — the rows behind a summary's counts. `status` wins over it. */
  notPresent?: boolean;
  /** Inclusive `yyyy-MM-dd` bounds. */
  from?: string;
  to?: string;
}

/** One row of a lesson's sheet — the roster, plus what is recorded. */
export interface DailySheetEntry {
  studentId: string;
  studentCode: string;
  studentNameLo: string;
  /** What the class calls them — `null` when none is on file. */
  studentNickname: string | null;
  rollNumber?: number | null;
  /** `null` when this student has not been marked yet. */
  status: AttendanceStatus | null;
  minutesLate: number | null;
  reason: string | null;
}

/** One timetabled lesson on the requested date, with its own roster. */
export interface DailySheetLesson {
  teachingAssignmentId: string;
  period: number;
  /** Local wall-clock `"HH:mm"`. */
  startTime: string;
  endTime: string;
  room: string | null;
  subject: Subject | null;
  teacher: Teacher | null;
  /**
   * ຄູສອນແທນ — who is answerable for this lesson today, when it is not the teacher
   * beside it. `null` on an ordinary lesson.
   */
  substituteTeacher: { teacherId: string; teacherCode: string | null; teacherName: string } | null;
  entries: DailySheetEntry[];
}

/**
 * `GET /attendances/daily-sheet` — every lesson the class has that day.
 *
 * The whole day arrives in one response because a teacher works through it in
 * one sitting; re-fetching per period would be a round trip for nothing.
 */
export interface DailySheet {
  date: string;
  lessons: DailySheetLesson[];
}

export interface AttendanceEntryInput {
  studentId: string;
  status: AttendanceStatus;
  minutesLate?: number;
  reason?: string;
}

/**
 * The lesson is the only thing the client names.
 *
 * Classroom, subject, semester, teacher and period are all read off the
 * assignment server-side, so a roll call can never be filed against a lesson
 * that is not on the timetable that day.
 */
export interface RecordAttendanceInput {
  teachingAssignmentId: string;
  /** `yyyy-MM-dd`; normalized to UTC midnight by the API. */
  date: string;
  entries: AttendanceEntryInput[];
}

/**
 * What narrows a summary below the whole term.
 *
 * `month` is the mark sheet's window; `from`/`to` (inclusive `yyyy-MM-dd`) are
 * for a stretch that is not a calendar month, and `subjectId` for one subject's
 * lessons. The API intersects whatever is given.
 */
export interface AttendanceSummaryScope {
  month?: number;
  from?: string;
  to?: string;
  subjectId?: string;
}

/**
 * `GET /attendances/summary/...` — counts per status over one semester, and
 * ວັນຂາດ as the office reads them.
 *
 * The raw counts are what the roll says; the `absent*` figures are the school's
 * rule applied to them, on the API so every sheet prints the same numbers:
 * excused and sick are one column, and every `latesPerAbsence` late arrivals
 * are a day absent without a reason.
 */
export interface AttendanceSummary {
  studentId: string;
  present: number;
  /** Marked absent outright. */
  absent: number;
  /** Every late arrival, before any became an absence. */
  late: number;
  excused: number;
  sick: number;
  totalRecorded: number;
  /** Absences made of late arrivals: one per `latesPerAbsence`. */
  lateAsAbsent: number;
  /** Lates left over once those absences are taken out — what still reads as late. */
  lateRemainder: number;
  /** ຂາດບໍ່ມີເຫດຜົນ: `absent` + `lateAsAbsent`. */
  absentUnexcused: number;
  /** ຂາດມີເຫດຜົນ: `excused` + `sick`. */
  absentExcused: number;
  /** Both kinds together. */
  absentTotal: number;
  /** The rule the figures were counted under. */
  latesPerAbsence: number;
  /** Present + late + excused + sick, less the lates that became absences, over total recorded. */
  attendanceRate: number;
}

/**
 * `GET /attendances/summary/semester/:id/absences` — one student over the
 * office's threshold, named, with the room they were most recently marked in.
 */
export interface AttendanceAbsenceRow extends AttendanceSummary {
  studentCode: string | null;
  studentNameLo: string | null;
  studentNickname: string | null;
  classroomId: string | null;
  classroomName: string | null;
  gradeLevelCode: string | null;
}

/** The threshold, the window, and optionally one room. */
export interface SemesterAbsencesParams extends AttendanceSummaryScope {
  minAbsentDays: number;
  classroomId?: string;
}

/**
 * The same counts, split by subject, worst attendance first.
 *
 * With one lesson per school day each weekday belongs to a different subject, so
 * a student who misses every Monday loses a whole subject while their overall
 * rate barely moves. The overall summary cannot show that.
 */
export interface AttendanceSubjectSummary extends AttendanceSummary {
  subjectId: string;
  subjectCode: string | null;
  subjectNameLo: string | null;
  subjectNameEn: string | null;
}

export const attendancesApi = {
  list: (params: AttendanceListParams = {}) =>
    get<PaginatedResponse<Attendance>>('/attendances', { params: cleanParams(params) }),

  dailySheet: (classroomId: string, date: string) =>
    get<DailySheet>('/attendances/daily-sheet', { params: { classroomId, date } }),

  record: (body: RecordAttendanceInput) => post<{ recorded: number }>('/attendances', body),

  /** `month` narrows to one calendar month of the term, as the class summary's does. */
  studentSummary: (studentId: string, semesterId: string, month?: number) =>
    get<AttendanceSummary>(`/attendances/summary/student/${studentId}/semester/${semesterId}`, {
      params: cleanParams({ month }),
    }),

  studentSubjectSummary: (studentId: string, semesterId: string) =>
    get<AttendanceSubjectSummary[]>(
      `/attendances/summary/student/${studentId}/semester/${semesterId}/by-subject`,
    ),

  /**
   * A bare month narrows the counts to one calendar month of the term, which is
   * what the monthly mark sheet's ວັນຂາດ column is counted over; a scope can
   * also bound the dates or pick one subject. Students with nothing recorded are
   * not listed, so a caller holding the roll reads a missing student as a clean
   * one.
   */
  classroomSummary: (
    classroomId: string,
    semesterId: string,
    scope: number | AttendanceSummaryScope = {},
  ) =>
    get<AttendanceSummary[]>(
      `/attendances/summary/classroom/${classroomId}/semester/${semesterId}`,
      { params: cleanParams(typeof scope === 'number' ? { month: scope } : { ...scope }) },
    ),

  /**
   * Who has reached `minAbsentDays` of ວັນຂາດ, across every room of the term
   * unless `classroomId` narrows it. Worst first. The office's own lines are
   * 15 and 30 days.
   */
  semesterAbsences: (semesterId: string, params: SemesterAbsencesParams) =>
    get<AttendanceAbsenceRow[]>(`/attendances/summary/semester/${semesterId}/absences`, {
      params: cleanParams({ ...params }),
    }),
};

export function useAttendances(params: AttendanceListParams) {
  return useQuery({
    queryKey: ['attendances', 'list', params],
    queryFn: () => attendancesApi.list(params),
    placeholderData: (previous) => previous,
  });
}

/**
 * The lessons behind one student's summary row — every record that is not a
 * plain `present`, newest first, with subject and teacher joined by the API.
 *
 * One page of the largest size the API allows: a student who is not present a
 * hundred times in one term is a different conversation, and the row says how
 * many more there are. Fetched only once the row is opened, so a class of forty
 * does not fire forty requests on load.
 */
export function useStudentAbsences(
  studentId: string | undefined,
  semesterId: string | undefined,
  classroomId: string | undefined,
  /** The same window and subject the summary row was counted over. */
  scope: Pick<AttendanceSummaryScope, 'from' | 'to' | 'subjectId'>,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['attendances', 'absences', studentId, semesterId, classroomId, scope],
    queryFn: () =>
      attendancesApi.list({
        studentId,
        semesterId,
        classroomId,
        ...scope,
        notPresent: true,
        limit: MAX_PAGE_SIZE,
      }),
    enabled: enabled && Boolean(studentId && semesterId),
  });
}

export function useDailySheet(classroomId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: ['attendances', 'daily-sheet', classroomId, date],
    queryFn: () => attendancesApi.dailySheet(classroomId!, date!),
    enabled: Boolean(classroomId && date),
    // The sheet is the form's starting state, so it must not be refetched out
    // from under half-finished roll call by a background revalidation.
    staleTime: Infinity,
  });
}

/**
 * Both summaries 404 when nothing has been recorded yet — a normal state early
 * in a term — so neither is retried; the caller renders an empty panel.
 */
export function useStudentAttendanceSummary(
  studentId: string | undefined,
  semesterId: string | undefined,
  month?: number,
) {
  return useQuery({
    queryKey: ['attendances', 'summary', 'student', studentId, semesterId, month ?? null],
    queryFn: () => attendancesApi.studentSummary(studentId!, semesterId!, month),
    enabled: Boolean(studentId && semesterId),
    retry: false,
  });
}

export function useStudentSubjectAttendanceSummary(
  studentId: string | undefined,
  semesterId: string | undefined,
) {
  return useQuery({
    queryKey: ['attendances', 'summary', 'student', studentId, semesterId, 'by-subject'],
    queryFn: () => attendancesApi.studentSubjectSummary(studentId!, semesterId!),
    enabled: Boolean(studentId && semesterId),
    retry: false,
  });
}

export function useClassroomAttendanceSummary(
  classroomId: string | undefined,
  semesterId: string | undefined,
  scope: AttendanceSummaryScope = {},
) {
  return useQuery({
    queryKey: ['attendances', 'summary', 'classroom', classroomId, semesterId, scope],
    queryFn: () => attendancesApi.classroomSummary(classroomId!, semesterId!, scope),
    enabled: Boolean(classroomId && semesterId),
    retry: false,
  });
}

export function useSemesterAbsences(
  semesterId: string | undefined,
  params: SemesterAbsencesParams,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ['attendances', 'summary', 'semester-absences', semesterId, params],
    queryFn: () => attendancesApi.semesterAbsences(semesterId!, params),
    enabled: enabled && Boolean(semesterId),
    retry: false,
  });
}

export function useRecordAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: RecordAttendanceInput) => attendancesApi.record(body),
    // Handled inline: a rejected date belongs next to the date picker, not in a
    // toast that disappears while the sheet still shows the bad value.
    meta: { silentError: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['attendances'] }),
  });
}

export const ATTENDANCE_STATUS_TONES: Record<
  AttendanceStatus,
  'success' | 'danger' | 'warning' | 'info'
> = {
  present: 'success',
  absent: 'danger',
  late: 'warning',
  excused: 'info',
  sick: 'info',
};
