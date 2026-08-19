import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { get } from '@/lib/api-client';
import { createCrudApi, createCrudHooks, useLookupQuery } from '@/lib/crud';
import { fullName } from '@/lib/utils';
import type { Guardian, Student } from '@/types/entities';
import type { Gender } from '@/types/enums';
import type { SelectOption } from '@/components/common/fields';

export interface GuardianInput {
  firstNameLo: string;
  lastNameLo: string;
  gender?: Gender;
  dateOfBirth?: string;
  nationalId?: string;
  phone: string;
  alternatePhone?: string;
  email?: string;
  occupation?: string;
  workplace?: string;
  villageId?: string;
  addressDetail?: string;
}

export const guardiansApi = {
  ...createCrudApi<Guardian, GuardianInput>('/guardians'),
  /** Students this guardian is linked to, with the relationship on each link. */
  children: (id: string) => get<Student[]>(`/guardians/${id}/children`),
};

export const guardians = createCrudHooks<Guardian, GuardianInput>('guardians', guardiansApi);

export function useGuardianChildren(id: string | undefined) {
  return useQuery({
    queryKey: ['guardians', 'children', id],
    queryFn: () => guardiansApi.children(id!),
    enabled: Boolean(id),
  });
}

export function useGuardianOptions(search: string) {
  const { i18n } = useTranslation();
  const query = useLookupQuery('guardians', guardiansApi.list, search, {}, 25);

  return {
    isLoading: query.isLoading,
    data: query.data?.data.map<SelectOption>((guardian) => ({
      value: guardian.id,
      label: `${fullName(guardian, i18n.language)} · ${guardian.phone}`,
    })),
  };
}
