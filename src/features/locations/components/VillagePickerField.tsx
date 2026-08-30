import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { EntitySelect } from '@/components/common/EntitySelect';
import type { SelectOption } from '@/components/common/fields';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { localizedName } from '@/lib/utils';
import type { LocationTreeNode } from '@/types/entities';
import { useLocationTree } from '../api';

/**
 * Province → district → village, which is how an address is actually said.
 *
 * The form stores only `villageId`; the two selects above it narrow the list
 * down to it. That is not decoration — Vientiane Capital alone has 488
 * villages, and eleven of its names are borne by more than one village, so a
 * single flat search offers `ດອນກອຍ` twice with nothing to tell them apart.
 *
 * The whole tree arrives in one cached request (about 680 rows) and the
 * filtering happens here, so changing a province costs nothing and the list
 * never lags a keystroke behind.
 */

interface VillagePickerFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  required?: boolean;
}

/** A local list dressed up as `EntitySelect`'s server-search hook. */
function localOptions(options: SelectOption[]) {
  return (search: string) => {
    const needle = search.trim().toLowerCase();
    return {
      isLoading: false,
      data: needle
        ? options.filter((option) => option.label.toLowerCase().includes(needle))
        : options,
    };
  };
}

export function VillagePickerField<T extends FieldValues>({
  control,
  name,
  label,
  required,
}: VillagePickerFieldProps<T>) {
  const { t, i18n } = useTranslation();
  const { data: tree, isLoading } = useLocationTree();

  const { provinces, byId, parentOf } = useMemo(() => {
    const byId = new Map<string, LocationTreeNode>();
    const parentOf = new Map<string, LocationTreeNode>();
    // The endpoint answers with an array of roots. Anything else is a failed or
    // stubbed response, and an address field is no reason to take a form down.
    const roots = Array.isArray(tree) ? tree : [];

    const walk = (nodes: LocationTreeNode[], parent?: LocationTreeNode) => {
      for (const node of nodes) {
        byId.set(node.id, node);
        if (parent) parentOf.set(node.id, parent);
        if (node.children?.length) walk(node.children, node);
      }
    };

    walk(roots);
    return { provinces: roots, byId, parentOf };
  }, [tree]);

  const toOptions = (nodes: LocationTreeNode[] = []): SelectOption[] =>
    nodes.map((node) => ({ value: node.id, label: localizedName(node, i18n.language) }));

  /**
   * Where the picker sits while no village is chosen yet.
   *
   * Once one is, the village decides what the two selects above show, so
   * reopening the form on another person can never leave a stale province on
   * screen.
   */
  const [pending, setPending] = useState<{ provinceId?: string; districtId?: string }>({});

  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const village = field.value ? byId.get(String(field.value)) : undefined;
        const district = village ? parentOf.get(village.id) : undefined;
        const province = district ? parentOf.get(district.id) : undefined;

        const provinceId = province?.id ?? pending.provinceId;
        const districtId = district?.id ?? pending.districtId;

        const districts = provinceId ? (byId.get(provinceId)?.children ?? []) : [];
        const villages = districtId ? (byId.get(districtId)?.children ?? []) : [];

        const selectProvince = (value?: string) => {
          setPending({ provinceId: value });
          field.onChange(undefined);
        };

        const selectDistrict = (value?: string) => {
          setPending({ provinceId, districtId: value });
          field.onChange(undefined);
        };

        const selectVillage = (value?: string) => {
          // Clearing the village must not also clear the two selects that found
          // it, or correcting a mistyped village means starting from the province.
          if (!value) setPending({ provinceId, districtId });
          field.onChange(value);
        };

        return (
          <>
            <FormItem>
              <FormLabel>{t('location.province')}</FormLabel>
              <FormControl>
                <EntitySelect
                  value={provinceId ?? null}
                  onChange={selectProvince}
                  useOptions={localOptions(toOptions(provinces))}
                  selectedLabel={
                    provinceId ? localizedName(byId.get(provinceId), i18n.language) : null
                  }
                  searchPlaceholder={t('location.searchProvince')}
                  disabled={isLoading}
                />
              </FormControl>
            </FormItem>

            <FormItem>
              <FormLabel>{t('location.district')}</FormLabel>
              <FormControl>
                <EntitySelect
                  value={districtId ?? null}
                  onChange={selectDistrict}
                  useOptions={localOptions(toOptions(districts))}
                  selectedLabel={
                    districtId ? localizedName(byId.get(districtId), i18n.language) : null
                  }
                  searchPlaceholder={t('location.searchDistrict')}
                  placeholder={t('location.selectProvinceFirst')}
                  disabled={isLoading || !provinceId}
                />
              </FormControl>
            </FormItem>

            <FormItem>
              <FormLabel required={required}>{label}</FormLabel>
              <FormControl>
                <EntitySelect
                  value={field.value ?? null}
                  onChange={selectVillage}
                  useOptions={localOptions(toOptions(villages))}
                  selectedLabel={village ? localizedName(village, i18n.language) : null}
                  searchPlaceholder={t('location.searchVillage')}
                  placeholder={
                    districtId ? t('common.selectPlaceholder') : t('location.selectDistrictFirst')
                  }
                  disabled={isLoading || !districtId || villages.length === 0}
                  invalid={Boolean(fieldState.error)}
                />
              </FormControl>
              {/* Outside the capital the official list stops at the district. */}
              {districtId && villages.length === 0 && (
                <FormDescription>{t('location.noVillagesHint')}</FormDescription>
              )}
              <FormMessage />
            </FormItem>
          </>
        );
      }}
    />
  );
}
