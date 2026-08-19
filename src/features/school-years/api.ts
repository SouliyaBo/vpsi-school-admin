import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { get, post } from '@/lib/api-client';
import { createCrudApi, createCrudHooks, useLookupQuery } from '@/lib/crud';
import { localizedName } from '@/lib/utils';
import type { SchoolYear } from '@/types/entities';
import type { SelectOption } from '@/components/common/fields';

export interface SchoolYearInput {
  code: string;
  nameLo: string;
  nameEn?: string;
  startDate: string;
  endDate: string;
}

export const schoolYearsApi = {
  ...createCrudApi<SchoolYear, SchoolYearInput>('/school-years'),
  /** 404s when no year has been activated yet — callers must tolerate that. */
  active: () => get<SchoolYear>('/school-years/active'),
  activate: (id: string) => post<SchoolYear>(`/school-years/${id}/activate`),
  close: (id: string) => post<SchoolYear>(`/school-years/${id}/close`),
};

export const schoolYears = createCrudHooks<SchoolYear, SchoolYearInput>(
  'school-years',
  schoolYearsApi,
);

export function useActiveSchoolYear() {
  return useQuery({
    queryKey: ['school-years', 'active'],
    queryFn: schoolYearsApi.active,
    staleTime: 5 * 60_000,
    // Absence is a normal state on a fresh deployment, not an error to retry.
    retry: false,
  });
}

export function useActivateSchoolYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schoolYearsApi.activate,
    meta: { successMessage: 'toast.updated' },
    onSuccess: () => {
      // Activating one year deactivates the others, so the whole list is stale.
      void queryClient.invalidateQueries({ queryKey: ['school-years'] });
      void queryClient.invalidateQueries({ queryKey: ['semesters'] });
    },
  });
}

export function useCloseSchoolYear() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: schoolYearsApi.close,
    meta: { successMessage: 'toast.updated' },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['school-years'] }),
  });
}

export function useSchoolYearOptions(search = '') {
  const { i18n } = useTranslation();
  const query = useLookupQuery(
    'school-years',
    schoolYearsApi.list,
    search,
    { sortBy: 'startDate', sortOrder: 'desc' },
    50,
  );

  return {
    isLoading: query.isLoading,
    data: query.data?.data.map<SelectOption>((year) => ({
      value: year.id,
      label: `${localizedName(year, i18n.language)}${year.isActive ? ' ●' : ''}`,
    })),
  };
}
