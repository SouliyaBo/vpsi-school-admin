import { get } from '@/lib/api-client';
import { createCrudApi, createCrudHooks, useLookupQuery, type ListParams } from '@/lib/crud';
import { localizedName } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { Location, LocationTreeNode } from '@/types/entities';
import type { SelectOption } from '@/components/common/fields';

export interface LocationInput {
  nameLo: string;
  nameEn?: string;
  code?: string;
  type: 'province' | 'district' | 'village';
  parentId?: string;
}

export const locationsApi = {
  ...createCrudApi<Location, LocationInput>('/locations'),
  /** Whole hierarchy in one call; cached server-side because address forms hit it constantly. */
  tree: () => get<LocationTreeNode[]>('/locations/tree'),
};

export const locations = createCrudHooks<Location, LocationInput>('locations', locationsApi);

export function useLocationTree() {
  return useQuery({
    queryKey: ['locations', 'tree'],
    queryFn: locationsApi.tree,
    staleTime: 5 * 60_000,
  });
}

export function useLocationOptions(type: 'province' | 'district', search = '') {
  const { i18n } = useTranslation();
  const query = useLookupQuery('locations', locationsApi.list, search, { type }, 100);

  return {
    isLoading: query.isLoading,
    data: query.data?.data.map<SelectOption>((location) => ({
      value: location.id,
      label: localizedName(location, i18n.language),
    })),
  };
}

export type { ListParams };
