import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { del, get, post, put } from '@/lib/api-client';
import type { ListParams } from '@/lib/crud';
import { cleanParams } from '@/lib/utils';
import type { PaginatedResponse } from '@/types/common';
import type { BehaviorLog, Classroom, Subject, Teacher } from '@/types/entities';

/**
 * The behaviour register (ການຕິດຕາມ ແລະ ບັນທຶກພຶດຕິກຳຂອງນັກຮຽນ).
 *
 * Not `createCrudApi`, because the unit of writing is a *row* of the paper sheet
 * rather than a record: one entry names several students, and the API stores one
 * record each while keeping them under a shared `groupId`. Every write path takes
 * that group id, so the screen edits and deletes what the teacher sees as a line.
 *
 * The two reads are shaped for their own screens — a month as a class sheet, and
 * a term as one student's history — rather than one list endpoint bent twice.
 */

export interface BehaviorLogListParams extends ListParams {
  studentId?: string;
  classroomId?: string;
  semesterId?: string;
  subjectId?: string;
  teacherId?: string;
  teachingAssignmentId?: string;
  /** Inclusive `yyyy-MM-dd` bounds. */
  from?: string;
  to?: string;
}

/** One named student on a row of the sheet. */
export interface SheetRowStudent {
  /** The underlying record, needed only to key the list. */
  id: string;
  studentId: string;
  studentCode: string | null;
  studentNameLo: string | null;
  /** What the class calls them — `null` when none is on file. */
  studentNickname: string | null;
  behavior: string | null;
  action: string | null;
}

/** One row of the register, reassembled from the records written with it. */
export interface SheetRow {
  groupId: string;
  date: string;
  period: number;
  subject: Subject | null;
  teacher: Teacher | null;
  classNote: string | null;
  remark: string | null;
  teachingAssignmentId: string;
  /** Empty for a row that only records the state of the class. */
  students: SheetRowStudent[];
}

/** `GET /behavior-logs/monthly-sheet` — the printable month, chronological. */
export interface MonthlySheet {
  classroom: Classroom;
  year: number;
  month: number;
  rows: SheetRow[];
}

/** One lesson the class has on the chosen date. */
export interface BehaviorLessonOption {
  teachingAssignmentId: string;
  period: number;
  /** Local wall-clock `"HH:mm"`. */
  startTime: string;
  endTime: string;
  room: string | null;
  subject: Subject | null;
  teacher: Teacher | null;
}

export interface RosterEntry {
  studentId: string;
  studentCode: string;
  studentNameLo: string;
  /** What the class calls them — `null` when none is on file. */
  studentNickname: string | null;
  rollNumber: number | null;
}

/**
 * `GET /behavior-logs/entry-context` — what the form offers for one class+date.
 *
 * The roster comes back once rather than per lesson: a behaviour row names a few
 * students out of the class, and the same list serves whichever lesson is picked.
 */
export interface BehaviorEntryContext {
  date: string;
  lessons: BehaviorLessonOption[];
  roster: RosterEntry[];
}

export interface BehaviorEntryInput {
  studentId: string;
  behavior?: string;
  action?: string;
}

/**
 * The lesson is the only thing the client names — classroom, semester, subject,
 * teacher and period are read off it server-side.
 *
 * `entries` may be empty for a row that only records the state of the class; a
 * row empty on both counts is refused by the API.
 */
export interface CreateBehaviorLogInput {
  teachingAssignmentId: string;
  /** `yyyy-MM-dd`; normalized to UTC midnight by the API. */
  date: string;
  classNote?: string;
  remark?: string;
  entries?: BehaviorEntryInput[];
}

/** Omitted fields keep what the row already says. */
export interface UpdateBehaviorLogInput {
  classNote?: string;
  remark?: string;
  entries?: BehaviorEntryInput[];
}

/** `GET /behavior-logs/tally/...` — per-student counts over one semester. */
export interface BehaviorTallyRow {
  studentId: string;
  studentCode: string | null;
  studentNameLo: string | null;
  /** What the class calls them — `null` when none is on file. */
  studentNickname: string | null;
  entries: number;
  /** Entries whose action column was filled in — a warning or a deduction. */
  withAction: number;
  lastDate: string;
}

export const behaviorLogsApi = {
  list: (params: BehaviorLogListParams = {}) =>
    get<PaginatedResponse<BehaviorLog>>('/behavior-logs', { params: cleanParams(params) }),

  monthlySheet: (classroomId: string, year: number, month: number) =>
    get<MonthlySheet>('/behavior-logs/monthly-sheet', { params: { classroomId, year, month } }),

  entryContext: (classroomId: string, date: string) =>
    get<BehaviorEntryContext>('/behavior-logs/entry-context', { params: { classroomId, date } }),

  create: (body: CreateBehaviorLogInput) =>
    post<{ groupId: string; recorded: number }>('/behavior-logs', body),

  update: (groupId: string, body: UpdateBehaviorLogInput) =>
    put<{ groupId: string; recorded: number }>(`/behavior-logs/${groupId}`, body),

  remove: (groupId: string) => del<void>(`/behavior-logs/${groupId}`),

  classroomTally: (classroomId: string, semesterId: string) =>
    get<BehaviorTallyRow[]>(`/behavior-logs/tally/classroom/${classroomId}/semester/${semesterId}`),
};

export function useBehaviorLogs(params: BehaviorLogListParams) {
  return useQuery({
    queryKey: ['behavior-logs', 'list', params],
    queryFn: () => behaviorLogsApi.list(params),
    placeholderData: (previous) => previous,
  });
}

export function useMonthlySheet(
  classroomId: string | undefined,
  year: number,
  month: number,
) {
  return useQuery({
    queryKey: ['behavior-logs', 'monthly-sheet', classroomId, year, month],
    queryFn: () => behaviorLogsApi.monthlySheet(classroomId!, year, month),
    enabled: Boolean(classroomId),
  });
}

export function useBehaviorEntryContext(
  classroomId: string | undefined,
  date: string | undefined,
) {
  return useQuery({
    queryKey: ['behavior-logs', 'entry-context', classroomId, date],
    queryFn: () => behaviorLogsApi.entryContext(classroomId!, date!),
    enabled: Boolean(classroomId && date),
  });
}

/** 404s while nothing has been recorded, which is normal, so it is not retried. */
export function useBehaviorTally(
  classroomId: string | undefined,
  semesterId: string | undefined,
) {
  return useQuery({
    queryKey: ['behavior-logs', 'tally', classroomId, semesterId],
    queryFn: () => behaviorLogsApi.classroomTally(classroomId!, semesterId!),
    enabled: Boolean(classroomId && semesterId),
    retry: false,
  });
}

export function useCreateBehaviorLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateBehaviorLogInput) => behaviorLogsApi.create(body),
    // Handled inline: a rejected date or lesson belongs next to the field that
    // set it, not in a toast that vanishes while the form still shows the value.
    meta: { silentError: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['behavior-logs'] }),
  });
}

export function useUpdateBehaviorLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, body }: { groupId: string; body: UpdateBehaviorLogInput }) =>
      behaviorLogsApi.update(groupId, body),
    meta: { silentError: true },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['behavior-logs'] }),
  });
}

export function useDeleteBehaviorLog() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => behaviorLogsApi.remove(groupId),
    meta: { successMessage: 'toast.deleted' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['behavior-logs'] }),
  });
}
