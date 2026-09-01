import { describe, expect, it } from 'vitest';
import { PERMISSION_RESOURCES } from '@/types/enums';
import {
  clearGroup,
  fromMatrix,
  grantReadToGroup,
  grantedResourceCount,
  isFullAccess,
  isGranted,
  toMatrix,
  toggleGrant,
  ungroupedResources,
} from './permission-matrix';

/**
 * The conversion between the API's list of grants and the grid's keyed map, and
 * the `manage`-implies-everything rule the grid draws and the API enforces.
 */
describe('permission matrix', () => {
  it('places every resource of the enum in exactly one group', () => {
    // A resource missing from `RESOURCE_GROUPS` would be ungrantable through the
    // UI while the API still honours it.
    expect(ungroupedResources()).toEqual([]);
  });

  it('drops a resource the API sent but this client does not know', () => {
    const matrix = toMatrix([
      { resource: 'students', actions: ['read'] },
      { resource: 'canteen', actions: ['manage'] },
    ]);

    expect(matrix).toEqual({ students: ['read'] });
  });

  it('leaves out resources with no grants on the way back', () => {
    const rows = fromMatrix({ students: ['read', 'update'], teachers: [], scores: undefined });

    // `PermissionDto` rejects an empty `actions` array, so an emptied row has to
    // disappear rather than travel as `[]`.
    expect(rows).toEqual([{ resource: 'students', actions: ['read', 'update'] }]);
  });

  it('returns resources in enum order regardless of edit order', () => {
    const rows = fromMatrix({ settings: ['read'], teachers: ['read'] });

    expect(rows.map((row) => row.resource)).toEqual(['teachers', 'settings']);
  });

  it('reads manage as covering every other action', () => {
    const matrix = { classrooms: ['manage' as const] };

    expect(isGranted(matrix, 'classrooms', 'delete')).toBe(true);
    expect(isGranted(matrix, 'classrooms', 'manage')).toBe(true);
    expect(isGranted(matrix, 'students', 'read')).toBe(false);
  });

  it('replaces the row when manage is granted, and clears it when withdrawn', () => {
    const granted = toggleGrant({ scores: ['create', 'read'] }, 'scores', 'manage');
    expect(granted.scores).toEqual(['manage']);

    // The four ticks that were showing under `manage` were implications, not
    // choices, so withdrawing it leaves nothing behind.
    expect(toggleGrant(granted, 'scores', 'manage').scores).toEqual([]);
  });

  it('ignores a click on an action already covered by manage', () => {
    const matrix = { scores: ['manage' as const] };

    expect(toggleGrant(matrix, 'scores', 'read')).toBe(matrix);
  });

  it('adds and removes a single action', () => {
    const withRead = toggleGrant({}, 'students', 'read');
    expect(withRead.students).toEqual(['read']);

    const withUpdate = toggleGrant(withRead, 'students', 'update');
    expect(withUpdate.students).toEqual(['read', 'update']);

    expect(toggleGrant(withUpdate, 'students', 'read').students).toEqual(['update']);
  });

  it('grants group read without disturbing grants already held', () => {
    const next = grantReadToGroup({ teachers: ['manage'], students: ['create'] }, [
      'teachers',
      'students',
      'guardians',
    ]);

    expect(next.teachers).toEqual(['manage']);
    expect(next.students).toEqual(['create', 'read']);
    expect(next.guardians).toEqual(['read']);
  });

  it('clears a whole group', () => {
    const next = clearGroup({ teachers: ['manage'], settings: ['read'] }, ['teachers']);

    expect(next.teachers).toEqual([]);
    expect(next.settings).toEqual(['read']);
  });

  it('counts only the resources that carry a grant', () => {
    expect(
      grantedResourceCount([
        { resource: 'students', actions: ['read'] },
        { resource: 'teachers', actions: [] },
      ]),
    ).toBe(1);
  });

  it('recognises full access only when manage is held on every resource', () => {
    const all = PERMISSION_RESOURCES.map((resource) => ({ resource, actions: ['manage'] }));

    expect(isFullAccess(all)).toBe(true);
    expect(isFullAccess(all.slice(1))).toBe(false);
    // `read` everywhere is not full access, however wide it looks.
    expect(
      isFullAccess(PERMISSION_RESOURCES.map((r) => ({ resource: r, actions: ['read'] }))),
    ).toBe(false);
  });
});
