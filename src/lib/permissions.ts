import type { PermissionAction, PermissionResource } from '@/types/enums';
import type { ResolvedPermission } from '@/types/common';

/**
 * Client-side reading of the same permission matrix the API enforces.
 *
 * This exists to decide what to *show* — never to decide what is *allowed*.
 * Every route and mutation is checked again by `PermissionsGuard` on the server;
 * hiding a button here only spares the user a 403.
 */

/** `manage` is the umbrella grant: holding it implies every other action. */
export function hasPermission(
  permissions: ResolvedPermission[] | undefined,
  resource: PermissionResource,
  action: PermissionAction = 'read',
): boolean {
  if (!permissions?.length) return false;
  const entry = permissions.find((permission) => permission.resource === resource);
  if (!entry) return false;
  return entry.actions.includes('manage') || entry.actions.includes(action);
}

/** True if the user can act on *any* of the given resources. */
export function hasAnyPermission(
  permissions: ResolvedPermission[] | undefined,
  resources: PermissionResource[],
  action: PermissionAction = 'read',
): boolean {
  return resources.some((resource) => hasPermission(permissions, resource, action));
}

export type PermissionCheck = {
  resource: PermissionResource;
  action?: PermissionAction;
};

export function satisfies(
  permissions: ResolvedPermission[] | undefined,
  check: PermissionCheck | PermissionCheck[] | undefined,
): boolean {
  if (!check) return true;
  const checks = Array.isArray(check) ? check : [check];
  // Any-of: a page listed under two resources should open if either is granted.
  return checks.some(({ resource, action }) => hasPermission(permissions, resource, action));
}
