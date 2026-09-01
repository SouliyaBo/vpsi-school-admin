import { useTranslation } from 'react-i18next';
import type { Control, FieldPath, FieldValues } from 'react-hook-form';
import { EntitySelect } from '@/components/common/EntitySelect';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { localizedName } from '@/lib/utils';
import { localOptions, useLocationIndex } from '../lib/location-index';

/**
 * Province → district → village, stopping wherever the answer runs out.
 *
 * The difference from `VillagePickerField` is what gets stored: this keeps the
 * deepest level actually chosen, so a birthplace in Savannakhet is filed under
 * its district and one in the capital under its village. That is not a
 * convenience — the official list carries villages for Vientiane Capital alone,
 * so a village-only field would leave every provincial birth as free text.
 *
 * Because the stored value can be any level, the three selects are driven from
 * it directly: the value's own ancestry decides what each select shows, and
 * picking a province *is* an answer rather than a step towards one. No pending
 * state is needed, which is what lets clearing the village fall back to the
 * district rather than emptying the field.
 */

interface PlacePickerFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  /** Labels the group; the three selects carry the level names themselves. */
  label: string;
  required?: boolean;
}

export function PlacePickerField<T extends FieldValues>({
  control,
  name,
  label,
  required,
}: PlacePickerFieldProps<T>) {
  const { t, i18n } = useTranslation();
  const { provinces, byId, parentOf, isLoading } = useLocationIndex();

  return (
    <FormField
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selected = field.value ? byId.get(String(field.value)) : undefined;

        // Which level the stored node sits at, read off its ancestry rather than
        // a `type` field — the tree endpoint nests, and the depth is the truth.
        const parent = selected ? parentOf.get(selected.id) : undefined;
        const grandparent = parent ? parentOf.get(parent.id) : undefined;

        const village = grandparent ? selected : undefined;
        const district = grandparent ? parent : parent ? selected : undefined;
        const province = grandparent ?? parent ?? selected;

        const provinceId = province?.id;
        const districtId = district?.id;

        const districts = provinceId ? (byId.get(provinceId)?.children ?? []) : [];
        const villages = districtId ? (byId.get(districtId)?.children ?? []) : [];

        const toOptions = (nodes: typeof provinces = []) =>
          nodes.map((node) => ({ value: node.id, label: localizedName(node, i18n.language) }));

        /**
         * Clearing is `''`, never `undefined`.
         *
         * `Controller` resolves its value with `get(formValues, name, defaultValue)`,
         * and that helper treats `undefined` as "absent" and hands back the
         * default instead — so `onChange(undefined)` on a student who already has
         * a birthplace leaves the old id in place and the field cannot be
         * cleared at all. Every form using this picker starts the field at `''`.
         */
        const choose = (value?: string) => field.onChange(value ?? '');

        return (
          <>
            <FormItem>
              <FormLabel required={required}>{label}</FormLabel>
              <FormControl>
                <EntitySelect
                  value={provinceId ?? null}
                  onChange={choose}
                  useOptions={localOptions(toOptions(provinces))}
                  selectedLabel={province ? localizedName(province, i18n.language) : null}
                  searchPlaceholder={t('location.searchProvince')}
                  disabled={isLoading}
                  invalid={Boolean(fieldState.error)}
                />
              </FormControl>
              <FormMessage />
            </FormItem>

            <FormItem>
              <FormLabel>{t('location.district')}</FormLabel>
              <FormControl>
                <EntitySelect
                  value={districtId ?? null}
                  onChange={(value) => choose(value ?? provinceId)}
                  useOptions={localOptions(toOptions(districts))}
                  selectedLabel={district ? localizedName(district, i18n.language) : null}
                  searchPlaceholder={t('location.searchDistrict')}
                  placeholder={t('location.selectProvinceFirst')}
                  disabled={isLoading || !provinceId}
                />
              </FormControl>
            </FormItem>

            <FormItem>
              <FormLabel>{t('location.village')}</FormLabel>
              <FormControl>
                <EntitySelect
                  value={village?.id ?? null}
                  // Clearing the village keeps the district, which is a complete
                  // answer here — it must not empty the whole field.
                  onChange={(value) => choose(value ?? districtId)}
                  useOptions={localOptions(toOptions(villages))}
                  selectedLabel={village ? localizedName(village, i18n.language) : null}
                  searchPlaceholder={t('location.searchVillage')}
                  placeholder={
                    districtId ? t('common.selectPlaceholder') : t('location.selectDistrictFirst')
                  }
                  disabled={isLoading || !districtId || villages.length === 0}
                />
              </FormControl>
              {/* Outside the capital the official list stops at the district. */}
              {districtId && villages.length === 0 && (
                <FormDescription>{t('location.noVillagesForPlaceHint')}</FormDescription>
              )}
            </FormItem>
          </>
        );
      }}
    />
  );
}
