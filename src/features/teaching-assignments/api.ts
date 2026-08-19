import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get } from '@/lib/api-client';
import { toApiError } from '@/lib/api-error';
import { createCrudApi, createCrudHooks } from '@/lib/crud';
import type { TeachingAssignment } from '@/types/entities';

export interface SchedulePeriodInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  room?: string;
  periodNumber?: number;
  /** Declares the period part of a two-teacher swap; see `SchedulePeriod`. */
  isRotating?: boolean;
}

export interface TeachingAssignmentInput {
  teacherId: string;
  subjectId: string;
  classroomId: string;
  semesterId: string;
  schedule: SchedulePeriodInput[];
  notes?: string;
}

/**
 * What a PATCH accepts.
 *
 * The four references are fixed at creation: moving an assignment to another
 * teacher or class is a different assignment, and the unique index is built on
 * that quadruple. A new `schedule` replaces the whole array.
 */
export interface TeachingAssignmentUpdateInput {
  schedule?: SchedulePeriodInput[];
  isActive?: boolean;
  notes?: string;
}

export const teachingAssignmentsApi = {
  ...createCrudApi<TeachingAssignment, TeachingAssignmentInput, TeachingAssignmentUpdateInput>(
    '/teaching-assignments',
  ),

  /** A teacher's week. Active assignments only, not paginated. */
  teacherSchedule: (teacherId: string, semesterId: string) =>
    get<TeachingAssignment[]>(
      `/teaching-assignments/teacher/${teacherId}/semester/${semesterId}`,
    ),

  /** A classroom's week — what it studies, and who teaches each subject. */
  classroomSchedule: (classroomId: string, semesterId: string) =>
    get<TeachingAssignment[]>(
      `/teaching-assignments/classroom/${classroomId}/semester/${semesterId}`,
    ),
};

export const teachingAssignments = createCrudHooks<
  TeachingAssignment,
  TeachingAssignmentInput,
  TeachingAssignmentUpdateInput
>('teaching-assignments', teachingAssignmentsApi);

function invalidateAssignments(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['teaching-assignments'] });
}

/**
 * Writes opt out of the error toast.
 *
 * A rejected save is nearly always a timetable clash, and the response names the
 * periods that clash — that belongs next to the schedule editor the user is
 * looking at, not in a toast that disappears while they fix it.
 */
export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: TeachingAssignmentInput) => teachingAssignmentsApi.create(body),
    meta: { successMessage: 'toast.created', silentError: true },
    onSuccess: () => invalidateAssignments(queryClient),
  });
}

export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: TeachingAssignmentUpdateInput }) =>
      teachingAssignmentsApi.update(id, body),
    meta: { successMessage: 'toast.updated', silentError: true },
    onSuccess: () => invalidateAssignments(queryClient),
  });
}

export interface BulkAssignOutcome {
  /** What the batch varies, and so what the caller keys its outcomes by. */
  subjectId: string;
  /** `undefined` when the row was created; the rejection otherwise. */
  error?: unknown;
}

/**
 * One teacher and class posted against several subjects.
 *
 * Sequential on purpose. The conflict check reads the assignments already in the
 * database, so firing the batch in parallel would let two rows of the same batch
 * pass a check that the other is about to invalidate. Running them in order also
 * makes a partial failure deterministic: the rows before the clash are in, the
 * clashing one is named, and nothing has to be guessed at.
 *
 * Never rejects — a failed row comes back in the result so the dialog can keep
 * the ones that worked and let the rest be corrected in place.
 */
export function useBulkCreateAssignments() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (items: TeachingAssignmentInput[]): Promise<BulkAssignOutcome[]> => {
      const outcomes: BulkAssignOutcome[] = [];
      for (const item of items) {
        try {
          await teachingAssignmentsApi.create(item);
          outcomes.push({ subjectId: item.subjectId });
        } catch (error) {
          outcomes.push({ subjectId: item.subjectId, error });
        }
      }
      return outcomes;
    },
    meta: { silentError: true },
    onSuccess: () => invalidateAssignments(queryClient),
  });
}

export function useTeacherSchedule(teacherId: string | undefined, semesterId: string | undefined) {
  return useQuery({
    queryKey: ['teaching-assignments', 'teacher-schedule', teacherId, semesterId],
    queryFn: () => teachingAssignmentsApi.teacherSchedule(teacherId!, semesterId!),
    enabled: Boolean(teacherId && semesterId),
  });
}

export function useClassroomSchedule(
  classroomId: string | undefined,
  semesterId: string | undefined,
) {
  return useQuery({
    queryKey: ['teaching-assignments', 'classroom-schedule', classroomId, semesterId],
    queryFn: () => teachingAssignmentsApi.classroomSchedule(classroomId!, semesterId!),
    enabled: Boolean(classroomId && semesterId),
  });
}

// ── Conflicts ───────────────────────────────────────────────────────────────

/** Mirrors `ConflictKind` in the API's `schedule-conflict.ts`. */
export type ConflictKind = 'teacher' | 'classroom' | 'room';

export interface ScheduleConflict {
  kind: ConflictKind;
  assignmentId: string;
  dayOfWeek: number;
  existing: { startTime: string; endTime: string; room?: string | null };
  requested: { startTime: string; endTime: string; room?: string | null };
  /** One side of the pair declares a swap and the other does not. */
  rotationMismatch?: boolean;
}

/**
 * The clashes a 409 from create/update carries in `details.conflicts`.
 *
 * The API reports one entry per (period, constraint) pair, so the same two
 * periods can appear twice when they collide on both the teacher and the room.
 * Identical entries are collapsed — the list is read, not counted.
 */
export function scheduleConflicts(error: unknown): ScheduleConflict[] {
  const details = toApiError(error).details as { conflicts?: ScheduleConflict[] } | undefined;
  if (!Array.isArray(details?.conflicts)) return [];

  const seen = new Set<string>();
  return details.conflicts.filter((conflict) => {
    const key = [
      conflict.kind,
      conflict.dayOfWeek,
      conflict.requested.startTime,
      conflict.existing.startTime,
      conflict.existing.room ?? '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
