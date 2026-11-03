import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { VillagePickerField } from '@/features/locations/components/VillagePickerField';
import { stripEmpty } from '@/lib/payload';
import { refId, toDateInput } from '@/lib/utils';
import {
  optionalDate,
  optionalEmail,
  optionalId,
  optionalPhone,
  optionalText,
  requiredPhone,
  requiredText,
} from '@/lib/zod-helpers';
import { GENDERS } from '@/types/enums';
import type { Guardian } from '@/types/entities';
import { Form } from '@/components/ui/form';
import { DateField, FieldSection, SelectField, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { guardians, type GuardianInput } from '../api';

const schema = z.object({
  firstNameLo: requiredText(80),
  lastNameLo: requiredText(80),
  gender: z.enum(GENDERS).optional(),
  dateOfBirth: optionalDate(),
  nationalId: optionalText(30),
  // The API requires a phone: a guardian with no reachable number is useless as
  // an emergency contact.
  phone: requiredPhone(),
  alternatePhone: optionalPhone(),
  email: optionalEmail(),
  occupation: optionalText(120),
  workplace: optionalText(150),
  villageId: optionalId(),
  addressDetail: optionalText(300),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  firstNameLo: '',
  lastNameLo: '',
  gender: undefined,
  dateOfBirth: '',
  nationalId: '',
  phone: '',
  alternatePhone: '',
  email: '',
  occupation: '',
  workplace: '',
  villageId: '',
  addressDetail: '',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The guardian to edit; `null` adds a new one. */
  guardian: Guardian | null;
  onSaved?: () => void;
}

/**
 * Adds or edits a guardian's own details.
 *
 * Shared by the guardians page and the student page's guardians tab, which is
 * where a homeroom teacher corrects a parent's phone. The API narrows that edit
 * to guardians of their own room; the form does not need to know.
 */
export function GuardianFormDialog({ open, onOpenChange, guardian, onSaved }: Props) {
  const { t } = useTranslation();
  const create = guardians.useCreate();
  const update = guardians.useUpdate();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    form.reset(
      guardian
        ? {
            firstNameLo: guardian.firstNameLo,
            lastNameLo: guardian.lastNameLo,
            gender: guardian.gender ?? undefined,
            dateOfBirth: toDateInput(guardian.dateOfBirth),
            nationalId: guardian.nationalId ?? '',
            phone: guardian.phone,
            alternatePhone: guardian.alternatePhone ?? '',
            email: guardian.email ?? '',
            occupation: guardian.occupation ?? '',
            workplace: guardian.workplace ?? '',
            villageId: refId(guardian.villageId) ?? '',
            addressDetail: guardian.addressDetail ?? '',
          }
        : EMPTY,
    );
  }, [open, guardian, form]);

  function submit(values: FormValues) {
    const body = stripEmpty(values) as GuardianInput;
    const mutation = guardian
      ? update.mutateAsync({ id: guardian.id, body })
      : create.mutateAsync(body);
    void mutation
      .then(() => {
        onSaved?.();
        onOpenChange(false);
      })
      .catch(() => {});
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={guardian ? t('guardian.edit') : t('guardian.create')}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={create.isPending || update.isPending}
      size="lg"
    >
      <Form {...form}>
        <div className="space-y-5">
          <FieldSection title={t('person.basicInfo')}>
            <TextField control={form.control} name="firstNameLo" label={t('person.firstNameLo')} required />
            <TextField control={form.control} name="lastNameLo" label={t('person.lastNameLo')} required />
            <SelectField
              control={form.control}
              name="gender"
              label={t('person.gender')}
              clearable
              options={GENDERS.map((gender) => ({ value: gender, label: t(`gender.${gender}`) }))}
            />
            <DateField control={form.control} name="dateOfBirth" label={t('person.dateOfBirth')} />
            <TextField control={form.control} name="nationalId" label={t('person.nationalId')} />
          </FieldSection>

          <FieldSection title={t('person.contactInfo')}>
            <TextField control={form.control} name="phone" label={t('person.phone')} type="tel" required />
            <TextField
              control={form.control}
              name="alternatePhone"
              label={t('guardian.alternatePhone')}
              type="tel"
            />
            <TextField control={form.control} name="email" label={t('person.email')} type="email" />
          </FieldSection>

          <FieldSection title={t('person.workInfo')}>
            <TextField control={form.control} name="occupation" label={t('guardian.occupation')} />
            <TextField control={form.control} name="workplace" label={t('guardian.workplace')} />
          </FieldSection>

          <FieldSection title={t('person.addressInfo')}>
            <VillagePickerField control={form.control} name="villageId" label={t('person.village')} />
            <TextField control={form.control} name="addressDetail" label={t('person.addressDetail')} />
          </FieldSection>
        </div>
      </Form>
    </FormDialog>
  );
}
