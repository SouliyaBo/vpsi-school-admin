import { useTranslation } from 'react-i18next';
import { createCrudApi, createCrudHooks, useLookupQuery } from '@/lib/crud';
import { localizedName } from '@/lib/utils';
import type { Role } from '@/types/entities';
import type { PermissionAction, PermissionResource } from '@/types/enums';
import type { SelectOption } from '@/components/common/fields';

export interface RoleInput {
  code: string;
  nameLo: string;
  nameEn: string;
  description?: string;
  permissions: { resource: PermissionResource; actions: PermissionAction[] }[];
}

/** `code` is fixed after creation — the seeded matrix is keyed on it. */
export type RoleUpdate = Partial<Omit<RoleInput, 'code'>>;

export const rolesApi = createCrudApi<Role, RoleInput, RoleUpdate>('/roles');

export const roles = createCrudHooks<Role, RoleInput, RoleUpdate>('roles', rolesApi);

/**
 * Every role at once — a school has six, and the account form needs all of them
 * in one dropdown without a search.
 *
 * Reading this needs `roles:read`, which the account form's own `users:create`
 * does not imply. In the seeded matrix only `admin` holds both, so a narrower
 * role sees an empty dropdown rather than an error.
 */
export function useRoleOptions(search = '') {
  const { i18n } = useTranslation();
  const query = useLookupQuery('roles', rolesApi.list, search, { sortBy: 'code' }, 50);

  return {
    isLoading: query.isLoading,
    data: query.data?.data.map<SelectOption>((role) => ({
      value: role.id,
      label: localizedName(role, i18n.language),
    })),
  };
}
