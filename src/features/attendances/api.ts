import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api-client';
import type { ListParams } from '@/lib/crud';
import { cleanParams } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/common';
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

/** `GET /attendances/summary/...` — counts per status over one semester. */
export interface AttendanceSummary {
  studentId: string;
  present: number;
  absent: number;
  late: number;
  excused: number;
  sick: number;
  totalRecorded: number;
  /** Present + late + excused + sick, over total recorded. */
  attendanceRate: number;
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

  studentSummary: (studentId: string, semesterId: string) =>
    get<AttendanceSummary>(`/attendances/summary/student/${studentId}/semester/${semesterId}`),

  studentSubjectSummary: (studentId: string, semesterId: string) =>
    get<AttendanceSubjectSummary[]>(
      `/attendances/summary/student/${studentId}/semester/${semesterId}/by-subject`,
    ),

  classroomSummary: (classroomId: string, semesterId: string) =>
    get<AttendanceSummary[]>(
      `/attendances/summary/classroom/${classroomId}/semester/${semesterId}`,
    ),
};

export function useAttendances(params: AttendanceListParams) {
  return useQuery({
    queryKey: ['attendances', 'list', params],
    queryFn: () => attendancesApi.list(params),
    placeholderData: (previous) => previous,
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
) {
  return useQuery({
    queryKey: ['attendances', 'summary', 'student', studentId, semesterId],
    queryFn: () => attendancesApi.studentSummary(studentId!, semesterId!),
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
) {
  return useQuery({
    queryKey: ['attendances', 'summary', 'classroom', classroomId, semesterId],
    queryFn: () => attendancesApi.classroomSummary(classroomId!, semesterId!),
    enabled: Boolean(classroomId && semesterId),
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
