import { useAuthStore } from './store';

/** The signed-in user, or `null` while anonymous. */
export function useCurrentUser() {
  return useAuthStore((state) => state.user);
}

/**
 * `can('students', 'create')` — the permission reader used to decide which
 * buttons and menu entries to render. The API enforces the same matrix.
 */
export function useCan() {
  return useAuthStore((state) => state.can);
}

/**
 * Whether this account looks across the whole school rather than a single
 * homeroom.
 *
 * Mirrors `StudentsService.homeroomStudentIds` on the API, which is the side
 * that enforces it — this only decides what is worth putting on screen. A
 * homeroom teacher may correct their own students but not move them between
 * statuses, so the status field is hidden from them rather than shown and then
 * refused. `students:update` no longer tells the two apart: the teacher role
 * holds it too.
 */
export function useSeesEveryStudent() {
  const can = useCan();
  return can('students', 'delete') || can('classrooms', 'manage');
}

export function useAuthStatus() {
  return useAuthStore((state) => state.status);
}

export function useIsAuthenticated() {
  return useAuthStore((state) => state.status === 'authenticated');
}
