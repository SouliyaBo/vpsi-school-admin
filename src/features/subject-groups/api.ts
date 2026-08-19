import { useTranslation } from 'react-i18next';
import { createCrudApi, createCrudHooks, useLookupQuery } from '@/lib/crud';
import { localizedName } from '@/lib/utils';
import type { SubjectGroup } from '@/types/entities';
import type { SelectOption } from '@/components/common/fields';

export interface SubjectGroupInput {
  code: string;
  nameLo: string;
  nameEn?: string;
  headTeacherId?: string | null;
  sortOrder?: number;
}

/** `code` is fixed after creation, as it is on grade levels and subjects. */
export type SubjectGroupUpdate = Partial<Omit<SubjectGroupInput, 'code'>> & {
  isActive?: boolean;
};

export const subjectGroupsApi = createCrudApi<SubjectGroup, SubjectGroupInput, SubjectGroupUpdate>(
  '/subject-groups',
);

export const subjectGroups = createCrudHooks<SubjectGroup, SubjectGroupInput, SubjectGroupUpdate>(
  'subject-groups',
  subjectGroupsApi,
);

/**
 * The whole set at once — a school has a handful of departments, and both the
 * subject form and the compliance filter want all of them without a search.
 */
export function useSubjectGroupOptions(search = '') {
  const { i18n } = useTranslation();
  const query = useLookupQuery(
    'subject-groups',
    subjectGroupsApi.list,
    search,
    { sortBy: 'sortOrder', sortOrder: 'asc' },
    50,
  );

  return {
    isLoading: query.isLoading,
    data: query.data?.data.map<SelectOption>((group) => ({
      value: group.id,
      label: localizedName(group, i18n.language),
    })),
  };
}
