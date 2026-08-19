import { createCrudApi, createCrudHooks, useLookupQuery } from '@/lib/crud';
import { localizedName } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import type { GradeLevel } from '@/types/entities';
import type { SelectOption } from '@/components/common/fields';

export interface GradeLevelInput {
  code: string;
  nameLo: string;
  nameEn?: string;
  level: number;
  isExitLevel?: boolean;
}

export const gradeLevelsApi = createCrudApi<GradeLevel, GradeLevelInput>('/grade-levels');
export const gradeLevels = createCrudHooks<GradeLevel, GradeLevelInput>(
  'grade-levels',
  gradeLevelsApi,
);

/** Grade levels are a short, stable list, so the whole set is fetched at once. */
export function useGradeLevelOptions(search = '') {
  const { i18n } = useTranslation();
  const query = useLookupQuery(
    'grade-levels',
    gradeLevelsApi.list,
    search,
    { sortBy: 'level', sortOrder: 'asc' },
    100,
  );

  return {
    isLoading: query.isLoading,
    data: query.data?.data.map<SelectOption>((level) => ({
      value: level.id,
      label: `${level.code} — ${localizedName(level, i18n.language)}`,
    })),
  };
}
