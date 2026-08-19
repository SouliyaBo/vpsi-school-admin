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
}

export interface BulkEnrollItem {
  /** Matched against `students.studentCode` by the API. */
  studentCode: string;
  classroomId: string;
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
  ...createCrudApi<Enrollment, EnrollmentInput>('/enrollments'),

  /** Active students in one classroom, in roll-number order. Not paginated. */
  roster: (classroomId: string) =>
    get<Enrollment[]>(`/enrollments/classroom/${classroomId}/roster`),

  /** Every enrollment a student has ever had, newest first, with refs populated. */
  history: (studentId: string) => get<Enrollment[]>(`/enrollments/student/${studentId}`),

  /**
   * Up to 500 rows, each in its own transaction — one bad row (full classroom,
   * already enrolled) does not roll back the others, and comes back in `errors`.
   */
  bulk: (items: BulkEnrollItem[]) => post<BulkEnrollResult>('/enrollments/bulk', { items }),

  changeStatus: (id: string, body: ChangeStatusInput) =>
    patch<Enrollment>(`/enrollments/${id}/status`, body),
};

export const enrollments = createCrudHooks<Enrollment, EnrollmentInput>(
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

export function useClassRoster(classroomId: string | undefined) {
  return useQuery({
    queryKey: ['enrollments', 'roster', classroomId],
    queryFn: () => enrollmentsApi.roster(classroomId!),
    enabled: Boolean(classroomId),
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
