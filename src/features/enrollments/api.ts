import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { get, patch, post } from '@/lib/api-client';
import { createCrudApi, createCrudHooks, type ListParams } from '@/lib/crud';
import type { Enrollment } from '@/types/entities';
import type { EnrollmentStatus } from '@/types/enums';

export interface EnrollmentInput {
  studentId: string;
  classroomId: string;
  /** Defaults to today on the API. */
  enrolledAt?: string;
  /** `ຫ້ອງພາກອັງກິດ` — free text, unrelated to `classroomId`. */
  englishClass?: string;
}

export interface BulkEnrollItem {
  /** Matched against `students.studentCode` by the API. */
  studentCode: string;
  classroomId: string;
  englishClass?: string;
}

/**
 * The only editable field on a placement.
 *
 * Changing classroom is `changeStatus` with `transferred`, which moves both
 * headcounts; the API rejects a classroom sent here.
 */
export interface EnrollmentUpdate {
  /** Empty string clears it. */
  englishClass?: string;
}

export interface BulkEnrollResult {
  enrolled: number;
  failed: number;
  /** One entry per rejected row, carrying the API's message key. */
  errors: { studentCode: string; reason: string }[];
}

export interface ChangeStatusInput {
  status: EnrollmentStatus;
  /** Required when transferring within the school. */
  transferredToClassroomId?: string;
  reason?: string;
}

export const enrollmentsApi = {
  ...createCrudApi<Enrollment, EnrollmentInput, EnrollmentUpdate>('/enrollments'),

  /** Active students in one classroom, in roll-number order. Not paginated. */
  roster: (classroomId: string) =>
    get<Enrollment[]>(`/enrollments/classroom/${classroomId}/roster`),

  /** Every enrollment a student has ever had, newest first, with refs populated. */
  history: (studentId: string) => get<Enrollment[]>(`/enrollments/student/${studentId}`),

  /** The `ຫ້ອງພາກອັງກິດ` labels in use for a year. Not paginated. */
  englishClasses: (schoolYearId?: string) =>
    get<string[]>('/enrollments/english-classes', {
      params: schoolYearId ? { schoolYearId } : {},
    }),

  /**
   * Up to 500 rows, each in its own transaction — one bad row (full classroom,
   * already enrolled) does not roll back the others, and comes back in `errors`.
   */
  bulk: (items: BulkEnrollItem[]) => post<BulkEnrollResult>('/enrollments/bulk', { items }),

  changeStatus: (id: string, body: ChangeStatusInput) =>
    patch<Enrollment>(`/enrollments/${id}/status`, body),
};

export const enrollments = createCrudHooks<Enrollment, EnrollmentInput, EnrollmentUpdate>(
  'enrollments',
  enrollmentsApi,
);

/**
 * Caches that go stale whenever a placement changes.
 *
 * Enrolling moves a student between the placement queue and a roster, and shifts
 * the classroom's headcount — so the students list, the classroom list and the
 * dashboard totals all have to be refetched, not just the enrollment itself.
 */
function invalidatePlacement(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['enrollments'] });
  void queryClient.invalidateQueries({ queryKey: ['students'] });
  void queryClient.invalidateQueries({ queryKey: ['classrooms'] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
}

export function useEnroll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: EnrollmentInput) => enrollmentsApi.create(body),
    // Handled inline: a full classroom or an existing placement needs to be shown
    // next to the classroom picker, not in a toast that hides the choice.
    meta: { silentError: true },
    onSuccess: () => invalidatePlacement(queryClient),
  });
}

export function useBulkEnroll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (items: BulkEnrollItem[]) => enrollmentsApi.bulk(items),
    meta: { silentError: true },
    onSuccess: () => invalidatePlacement(queryClient),
  });
}

export function useChangeEnrollmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ChangeStatusInput }) =>
      enrollmentsApi.changeStatus(id, body),
    meta: { successMessage: 'toast.updated' },
    onSuccess: () => invalidatePlacement(queryClient),
  });
}

/**
 * Sets `ຫ້ອງພາກອັງກິດ` on an existing placement.
 *
 * Invalidates the whole placement group rather than just the enrollment: the
 * room is projected onto the students list as `currentEnrollment.englishClass`,
 * so a save that refreshed only the roster would leave that list stale.
 */
export function useUpdateEnrollment({ silent = false }: { silent?: boolean } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: EnrollmentUpdate }) =>
      enrollmentsApi.update(id, body),
    // `silent` is for the student form, which saves the record and the room in
    // one submit: two "Saved" toasts for one click reads as two saves.
    meta: silent ? undefined : { successMessage: 'toast.updated' },
    onSuccess: () => invalidatePlacement(queryClient),
  });
}

export function useClassRoster(classroomId: string | undefined) {
  return useQuery({
    queryKey: ['enrollments', 'roster', classroomId],
    queryFn: () => enrollmentsApi.roster(classroomId!),
    enabled: Boolean(classroomId),
  });
}

/**
 * The English rooms a filter can offer, as `{ value, label }` for `FilterSelect`.
 *
 * The rooms are free text with no register of their own, so the only list of
 * them is what the office has written on this year's placements — which is why
 * this is read from the API rather than held as a constant. Cached for the
 * session: it changes only when somebody assigns a room nobody had used before.
 */
export function useEnglishClassOptions(schoolYearId?: string) {
  return useQuery({
    queryKey: ['enrollments', 'english-classes', schoolYearId ?? 'active'],
    queryFn: () => enrollmentsApi.englishClasses(schoolYearId),
    select: (labels) => labels.map((label) => ({ value: label, label })),
    staleTime: 5 * 60 * 1000,
  });
}

export function useEnrollmentHistory(studentId: string | undefined) {
  return useQuery({
    queryKey: ['enrollments', 'history', studentId],
    queryFn: () => enrollmentsApi.history(studentId!),
    enabled: Boolean(studentId),
  });
}

/**
 * Which statuses an `active` enrollment may move to, mirroring
 * `ALLOWED_TRANSITIONS` in the API. `dropped` can only return to `active`;
 * `transferred`, `promoted` and `repeated` are terminal.
 */
export const ALLOWED_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  active: ['transferred', 'promoted', 'dropped', 'repeated'],
  transferred: [],
  promoted: [],
  dropped: ['active'],
  repeated: [],
};

export type { ListParams };
