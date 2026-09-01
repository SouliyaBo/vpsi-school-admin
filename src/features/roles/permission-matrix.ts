import type { PermissionAction, PermissionResource } from '@/types/enums';
import { PERMISSION_RESOURCES } from '@/types/enums';

/**
 * The shape the permission grid is edited in, and the rules for drawing it.
 *
 * The API stores the matrix as a list of `{ resource, actions }` rows, which is
 * the right shape for an authorization check and the wrong one for a form: a
 * checkbox needs to ask "is `update` granted on `students`?" without scanning a
 * list. So the form holds a keyed map and converts on the way in and out.
 */

export type PermissionMatrix = Partial<Record<PermissionResource, PermissionAction[]>>;

/**
 * The action columns every resource gets.
 *
 * `manage` sits apart from the four because it is not a fifth verb but an
 * umbrella over all of them — see `lib/permissions.hasPermission`, and
 * `PermissionsGuard` on the API, which both read it that way.
 */
export const CRUD_ACTIONS = [
  'create',
  'read',
  'update',
  'delete',
] as const satisfies readonly PermissionAction[];

/**
 * The two actions that exist on only a handful of resources, given their own
 * columns so the other thirty rows are not padded with checkboxes for a verb
 * their endpoints do not have.
 *
 *  • `approve` — LessonPlansController.approve and ExamsController.approve.
 *  • `export`  — checked inside ReportsService, not by a route decorator.
 *
 * Everything else is offered the four CRUD actions plus `manage`, whether or not
 * a matching endpoint exists today. Being generous here is deliberate: a grid
 * that hides a column cannot grant it, and locking the office out of a grant the
 * API would have accepted is worse than offering one it ignores.
 */
export const SPECIAL_ACTIONS: { action: PermissionAction; resources: PermissionResource[] }[] = [
  { action: 'approve', resources: ['lesson-plans', 'exams'] },
  { action: 'export', resources: ['reports'] },
];

export function actionApplies(resource: PermissionResource, action: PermissionAction): boolean {
  const special = SPECIAL_ACTIONS.find((entry) => entry.action === action);
  return special ? special.resources.includes(resource) : true;
}

/** Column order of the grid: the four CRUD verbs, the two rare ones, `manage`. */
export const ACTION_COLUMNS: PermissionAction[] = [
  ...CRUD_ACTIONS,
  ...SPECIAL_ACTIONS.map((entry) => entry.action),
  'manage',
];

export interface ResourceGroup {
  /** i18n key under `role.group.`. */
  labelKey: string;
  resources: PermissionResource[];
}

/**
 * The 32 resources arranged the way the sidebar is, so an administrator reading
 * the grid recognises the shape of the menu they are granting access to.
 *
 * Every resource appears exactly once — asserted by `ungroupedResources()`,
 * which the page's test reads, so adding one to `PERMISSION_RESOURCES` without
 * placing it here fails loudly instead of silently dropping out of the grid.
 */
export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    labelKey: 'people',
    resources: ['teachers', 'students', 'guardians', 'locations'],
  },
  {
    labelKey: 'academic',
    resources: [
      'school-years',
      'semesters',
      'grade-levels',
      'classrooms',
      'subject-groups',
      'subjects',
      'teaching-assignments',
    ],
  },
  {
    labelKey: 'operations',
    resources: [
      'enrollments',
      'score-components',
      'scores',
      'conduct-scores',
      'behavior-logs',
      'attendances',
      'term-results',
      'lesson-plans',
      'exams',
      'certificates',
      'reports',
      'vaccinations',
    ],
  },
  {
    labelKey: 'communication',
    resources: ['announcements', 'notifications', 'calendar', 'documents', 'feedback'],
  },
  {
    labelKey: 'system',
    resources: ['users', 'roles', 'audit-logs', 'settings'],
  },
];

/** Resources missing from `RESOURCE_GROUPS` — empty unless the enum grew. */
export function ungroupedResources(): PermissionResource[] {
  const grouped = new Set(RESOURCE_GROUPS.flatMap((group) => group.resources));
  return PERMISSION_RESOURCES.filter((resource) => !grouped.has(resource));
}

export function toMatrix(
  permissions: { resource: string; actions: string[] }[] | undefined,
): PermissionMatrix {
  const matrix: PermissionMatrix = {};
  for (const entry of permissions ?? []) {
    // Anything the client does not know about — a resource added by a newer API
    // — is dropped rather than carried through as an unrenderable row.
    if (!(PERMISSION_RESOURCES as readonly string[]).includes(entry.resource)) continue;
    matrix[entry.resource as PermissionResource] = entry.actions as PermissionAction[];
  }
  return matrix;
}

/**
 * Back to the API's shape, in enum order and without the resources that ended up
 * with nothing granted — an empty `actions` array is rejected by
 * `PermissionDto.@ArrayNotEmpty`.
 */
export function fromMatrix(
  matrix: PermissionMatrix,
): { resource: PermissionResource; actions: PermissionAction[] }[] {
  return PERMISSION_RESOURCES.filter((resource) => matrix[resource]?.length).map((resource) => ({
    resource,
    actions: matrix[resource]!,
  }));
}

export function isGranted(
  matrix: PermissionMatrix,
  resource: PermissionResource,
  action: PermissionAction,
): boolean {
  const actions = matrix[resource];
  if (!actions?.length) return false;
  return action === 'manage'
    ? actions.includes('manage')
    : actions.includes('manage') || actions.includes(action);
}

/**
 * Adds or removes one grant.
 *
 * `manage` replaces the row rather than joining it: storing `['manage', 'read']`
 * would be two ways of saying the same thing, and the seeded matrix says it one
 * way. Turning `manage` off clears the row for the same reason — the four boxes
 * that were showing as ticked were showing what `manage` implied, not choices
 * anyone made.
 */
export function toggleGrant(
  matrix: PermissionMatrix,
  resource: PermissionResource,
  action: PermissionAction,
): PermissionMatrix {
  const current = matrix[resource] ?? [];

  if (action === 'manage') {
    return { ...matrix, [resource]: current.includes('manage') ? [] : ['manage'] };
  }
  // A grid where ticking `read` under a live `manage` silently downgraded the
  // row would be a trap, so the implied ticks are rendered disabled instead.
  if (current.includes('manage')) return matrix;

  const next = current.includes(action)
    ? current.filter((entry) => entry !== action)
    : [...current, action];
  return { ...matrix, [resource]: next };
}

/** Grants `read` on every resource of a group, leaving grants already there. */
export function grantReadToGroup(
  matrix: PermissionMatrix,
  resources: PermissionResource[],
): PermissionMatrix {
  const next = { ...matrix };
  for (const resource of resources) {
    const current = next[resource] ?? [];
    if (current.includes('manage') || current.includes('read')) continue;
    next[resource] = [...current, 'read'];
  }
  return next;
}

export function clearGroup(
  matrix: PermissionMatrix,
  resources: PermissionResource[],
): PermissionMatrix {
  const next = { ...matrix };
  for (const resource of resources) next[resource] = [];
  return next;
}

/** How many resources carry at least one grant — the list column's summary. */
export function grantedResourceCount(
  permissions: { resource: string; actions: string[] }[] | undefined,
): number {
  return (permissions ?? []).filter((entry) => entry.actions.length > 0).length;
}

/** True when the role holds `manage` on every resource — i.e. it is `admin`. */
export function isFullAccess(
  permissions: { resource: string; actions: string[] }[] | undefined,
): boolean {
  const matrix = toMatrix(permissions);
  return PERMISSION_RESOURCES.every((resource) => matrix[resource]?.includes('manage'));
}
