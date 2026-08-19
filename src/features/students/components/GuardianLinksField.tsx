import { Plus, Trash2, UserPlus, Users } from 'lucide-react';
import { useFieldArray, type Control, type FieldPath, type FieldValues } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useGuardianOptions } from '@/features/guardians/api';
import { GUARDIAN_RELATIONSHIPS } from '@/types/enums';
import { Button } from '@/components/ui/button';
import { FieldsetMessage } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { CheckboxField, SelectField, TextField } from '@/components/common/fields';

/**
 * Editor for a student's guardian list.
 *
 * Each row is either a link to an existing guardian or a new guardian the API
 * creates in the same transaction — the second path matters because at enrolment
 * the parent usually is not on file yet.
 *
 * The API enforces two rules that this UI has to make visible: at least one
 * guardian, and exactly one marked primary. "Primary" is therefore a radio group
 * across rows, not a per-row checkbox.
 */

export interface GuardianLinkValue {
  mode: 'existing' | 'new';
  guardianId?: string;
  firstNameLo?: string;
  lastNameLo?: string;
  phone?: string;
  occupation?: string;
  relationship: (typeof GUARDIAN_RELATIONSHIPS)[number];
  isPrimary?: boolean;
  isEmergencyContact?: boolean;
  canViewRecords?: boolean;
}

export const EMPTY_GUARDIAN_LINK: GuardianLinkValue = {
  mode: 'existing',
  guardianId: '',
  firstNameLo: '',
  lastNameLo: '',
  phone: '',
  occupation: '',
  relationship: 'father',
  isPrimary: true,
  isEmergencyContact: true,
  canViewRecords: true,
};

/**
 * Maps the form rows onto the API's `StudentGuardianInput[]`.
 *
 * A `new` row sends the nested `guardian` object; an `existing` row sends only
 * `guardianId`. Sending both would have the API ignore the nested one silently.
 */
export function toGuardianPayload(links: GuardianLinkValue[]) {
  return links.map((link) => ({
    ...(link.mode === 'existing'
      ? { guardianId: link.guardianId }
      : {
          guardian: {
            firstNameLo: link.firstNameLo!,
            lastNameLo: link.lastNameLo!,
            phone: link.phone!,
            // Omitted rather than sent empty — the API rejects a blank string on
            // an optional field it length-checks.
            ...(link.occupation ? { occupation: link.occupation } : {}),
          },
        }),
    relationship: link.relationship,
    isPrimary: Boolean(link.isPrimary),
    isEmergencyContact: Boolean(link.isEmergencyContact),
    canViewRecords: Boolean(link.canViewRecords),
  }));
}

interface Props<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
}

export function GuardianLinksField<T extends FieldValues>({ control, name }: Props<T>) {
  const { t } = useTranslation();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { fields, append, remove, update } = useFieldArray({ control: control as any, name: name as any });

  const rows = fields as unknown as ({ id: string } & GuardianLinkValue)[];
  const primaryIndex = rows.findIndex((row) => row.isPrimary);

  function setPrimary(index: number) {
    rows.forEach((row, rowIndex) => {
      if (Boolean(row.isPrimary) === (rowIndex === index)) return;
      update(rowIndex, { ...row, isPrimary: rowIndex === index });
    });
  }

  function setMode(index: number, mode: 'existing' | 'new') {
    const row = rows[index];
    if (!row) return;
    // Clear the other branch's values so a stale id or a half-typed name cannot
    // reach the payload.
    update(index, {
      ...row,
      mode,
      guardianId: mode === 'existing' ? row.guardianId : '',
      firstNameLo: mode === 'new' ? row.firstNameLo : '',
      lastNameLo: mode === 'new' ? row.lastNameLo : '',
      phone: mode === 'new' ? row.phone : '',
      occupation: mode === 'new' ? row.occupation : '',
    });
  }

  return (
    <fieldset className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t('student.guardians')}
          </legend>
          <p className="text-xs text-muted-foreground">{t('student.guardiansHint')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            append({
              ...EMPTY_GUARDIAN_LINK,
              relationship: 'mother',
              // Only the first row may default to primary.
              isPrimary: rows.length === 0,
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any)
          }
        >
          <Plus />
          {t('student.addGuardian')}
        </Button>
      </div>

      {rows.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-6 text-center">
          <Users className="size-5 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('student.atLeastOneGuardian')}</p>
        </div>
      )}

      <RadioGroup
        value={primaryIndex >= 0 ? String(primaryIndex) : ''}
        onValueChange={(value) => setPrimary(Number(value))}
        className="space-y-3"
      >
        {rows.map((row, index) => (
          <div key={row.id} className="space-y-3 rounded-lg border border-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <RadioGroupItem value={String(index)} id={`${name}-primary-${index}`} />
                <Label htmlFor={`${name}-primary-${index}`} className="cursor-pointer">
                  {t('student.isPrimary')}
                </Label>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant={row.mode === 'existing' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setMode(index, 'existing')}
                >
                  <Users />
                  {t('student.existingGuardian')}
                </Button>
                <Button
                  type="button"
                  variant={row.mode === 'new' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setMode(index, 'new')}
                >
                  <UserPlus />
                  {t('student.newGuardian')}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-danger"
                  aria-label={t('common.remove')}
                  onClick={() => {
                    remove(index);
                    // Removing the primary row leaves the student with none, so
                    // promote whichever row becomes first.
                    if (row.isPrimary && rows.length > 1) {
                      const nextIndex = index === 0 ? 1 : 0;
                      const nextRow = rows[nextIndex];
                      if (nextRow) update(nextIndex, { ...nextRow, isPrimary: true });
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {row.mode === 'existing' ? (
                <EntitySelectField
                  control={control}
                  name={`${name}.${index}.guardianId` as FieldPath<T>}
                  label={t('guardian.title')}
                  required
                  useOptions={useGuardianOptions}
                  searchPlaceholder={t('common.search')}
                />
              ) : (
                <>
                  <TextField
                    control={control}
                    name={`${name}.${index}.firstNameLo` as FieldPath<T>}
                    label={t('person.firstNameLo')}
                    required
                  />
                  <TextField
                    control={control}
                    name={`${name}.${index}.lastNameLo` as FieldPath<T>}
                    label={t('person.lastNameLo')}
                    required
                  />
                  <TextField
                    control={control}
                    name={`${name}.${index}.phone` as FieldPath<T>}
                    label={t('person.phone')}
                    type="tel"
                    required
                  />
                  <TextField
                    control={control}
                    name={`${name}.${index}.occupation` as FieldPath<T>}
                    label={t('guardian.occupation')}
                  />
                </>
              )}

              <SelectField
                control={control}
                name={`${name}.${index}.relationship` as FieldPath<T>}
                label={t('student.relationship')}
                required
                options={GUARDIAN_RELATIONSHIPS.map((relationship) => ({
                  value: relationship,
                  label: t(`relationship.${relationship}`),
                }))}
              />
            </div>

            <div className="flex flex-wrap gap-x-6">
              <CheckboxField
                control={control}
                name={`${name}.${index}.isEmergencyContact` as FieldPath<T>}
                label={t('student.isEmergencyContact')}
              />
              <CheckboxField
                control={control}
                name={`${name}.${index}.canViewRecords` as FieldPath<T>}
                label={t('student.canViewRecords')}
              />
            </div>
          </div>
        ))}
      </RadioGroup>

      {/* Array-level rules (empty list, no primary) have no input to attach to. */}
      <FieldsetMessage control={control} name={name} />
    </fieldset>
  );
}
