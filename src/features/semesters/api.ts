import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { get, post } from '@/lib/api-client';
import { createCrudApi, createCrudHooks, useLookupQuery } from '@/lib/crud';
import { localizedName } from '@/lib/utils';
import type { Semester } from '@/types/entities';
import type { SelectOption } from '@/components/common/fields';

export interface SemesterInput {
  schoolYearId: string;
  number: number;
  nameLo: string;
  nameEn?: string;
  startDate: string;
  endDate: string;
}

export const semestersApi = {
  ...createCrudApi<Semester, SemesterInput>('/semesters'),
  active: () => get<Semester>('/semesters/active'),
  activate: (id: string) => post<Semester>(`/semesters/${id}/activate`),
};

export const semesters = createCrudHooks<Semester, SemesterInput>('semesters', semestersApi);

export function useActiveSemester() {
  return useQuery({
    queryKey: ['semesters', 'active'],
    queryFn: semestersApi.active,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useActivateSemester() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: semestersApi.activate,
    meta: { successMessage: 'toast.updated' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['semesters'] }),
  });
}

export function useSemesterOptions(search = '', schoolYearId?: string) {
  const { i18n } = useTranslation();
  const query = useLookupQuery(
    'semesters',
    semestersApi.list,
    search,
    { sortBy: 'startDate', sortOrder: 'desc', ...(schoolYearId ? { schoolYearId } : {}) },
    50,
  );

  return {
    isLoading: query.isLoading,
    data: query.data?.data.map<SelectOption>((semester) => ({
      value: semester.id,
      label: `${localizedName(semester, i18n.language)}${semester.isActive ? ' ●' : ''}`,
    })),
  };
}
