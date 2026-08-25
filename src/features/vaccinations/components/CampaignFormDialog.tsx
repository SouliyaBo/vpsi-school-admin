import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useGradeLevelOptions } from '@/features/grade-levels/api';
import { useSchoolYearOptions } from '@/features/school-years/api';
import { stripEmpty } from '@/lib/payload';
import { refId, toDateInput } from '@/lib/utils';
import { optionalDate, optionalText, requiredDate, requiredText } from '@/lib/zod-helpers';
import type { VaccinationCampaign } from '@/types/entities';
import { GENDERS, VACCINATION_CAMPAIGN_STATUSES, VACCINES } from '@/types/enums';
import { Checkbox } from '@/components/ui/checkbox';
import { Form } from '@/components/ui/form';
import { Label } from '@/components/ui/label';
import { EntitySelectField } from '@/components/common/EntitySelect';
import {
  DateField,
  FieldSection,
  NumberField,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { campaigns, type CampaignInput } from '../api';

const schema = z.object({
  nameLo: requiredText(200),
  vaccine: z.enum(VACCINES),
  doseNumber: z.coerce.number().int().min(1),
  scheduledDate: requiredDate(),
  schoolYearId: requiredText(30),
  provider: optionalText(200),
  status: z.enum(VACCINATION_CAMPAIGN_STATUSES),
  notes: optionalText(1000),
  /**
   * The eligibility rule — the only place a round is girls-only.
   *
   * A blank gender covers everyone, which is the usual case: HPV and Td come for
   * girls of a given age, MR and JE come for whole cohorts. Never inferred from
   * the vaccine, so the next whole-school HPV round needs no code change.
   */
  gender: z.union([z.enum(GENDERS), z.literal('')]),
  gradeLevelIds: z.array(z.string()),
  /**
   * A birth window rather than an age range: an age is only true on the day it is
   * read, and the roll has to mean the same thing when it is rebuilt next month.
   */
  bornFrom: optionalDate(),
  bornTo: optionalDate(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  nameLo: '',
  vaccine: 'hpv',
  doseNumber: 1,
  scheduledDate: '',
  schoolYearId: '',
  provider: '',
  status: 'planned',
  notes: '',
  gender: '',
  gradeLevelIds: [],
  bornFrom: '',
  bornTo: '',
};

function toFormValues(campaign: VaccinationCampaign): FormValues {
  return {
    nameLo: campaign.nameLo,
    vaccine: campaign.vaccine,
    doseNumber: campaign.doseNumber,
    scheduledDate: toDateInput(campaign.scheduledDate),
    schoolYearId: refId(campaign.schoolYearId) ?? '',
    provider: campaign.provider ?? '',
    status: campaign.status,
    notes: campaign.notes ?? '',
    gender: campaign.eligibility?.gender ?? '',
    gradeLevelIds: (campaign.eligibility?.gradeLevelIds ?? [])
      .map((id) => refId(id))
      .filter((id): id is string => Boolean(id)),
    bornFrom: toDateInput(campaign.eligibility?.bornFrom),
    bornTo: toDateInput(campaign.eligibility?.bornTo),
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: VaccinationCampaign | null;
}

export function CampaignFormDialog({ open, onOpenChange, campaign }: Props) {
  const { t } = useTranslation();
  const create = campaigns.useCreate();
  const update = campaigns.useUpdate();
  const gradeLevels = useGradeLevelOptions();
  const isEditing = campaign !== null;

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    form.reset(campaign ? toFormValues(campaign) : EMPTY);
  }, [open, campaign, form]);

  const selectedGrades = form.watch('gradeLevelIds');

  function submit(values: FormValues) {
    const { gender, gradeLevelIds, bornFrom, bornTo, ...rest } = values;
    const body = {
      ...stripEmpty(rest),
      eligibility: stripEmpty({ gender, gradeLevelIds, bornFrom, bornTo }),
    };

    if (campaign) {
      // `vaccine`, `doseNumber` and `schoolYearId` are fixed once a round exists:
      // the records already filed against it name the vaccine and dose they were,
      // and the API's update DTO rejects them rather than ignoring them.
      const { vaccine: _v, doseNumber: _d, schoolYearId: _y, ...patch } = body as CampaignInput;
      void update.mutateAsync({ id: campaign.id, body: patch }).then(() => onOpenChange(false));
      return;
    }

    void create
      .mutateAsync(body as CampaignInput)
      .then(() => onOpenChange(false))
      .catch(() => { });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? t('vaccination.editCampaign') : t('vaccination.createCampaign')}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={create.isPending || update.isPending}
      size="lg"
    >
      <Form {...form}>
        <div className="space-y-5">
          <FieldSection title={t('vaccination.campaign')}>
            <TextField
              control={form.control}
              name="nameLo"
              label={t('common.nameLo')}
              required
              placeholder="ວັກຊີນ HPV ເຂັມທີ 1"
              className="sm:col-span-2"
            />
            <SelectField
              control={form.control}
              name="vaccine"
              label={t('vaccination.vaccine')}
              required
              disabled={isEditing}
              options={VACCINES.map((vaccine) => ({
                value: vaccine,
                label: t(`vaccine.${vaccine}`),
              }))}
            />
            <NumberField
              control={form.control}
              name="doseNumber"
              label={t('vaccination.doseNumber')}
              required
              disabled={isEditing}
              min={1}
            />
            <DateField
              control={form.control}
              name="scheduledDate"
              label={t('vaccination.scheduledDate')}
              required
            />
            <EntitySelectField
              control={form.control}
              name="schoolYearId"
              label={t('nav.schoolYears')}
              required
              disabled={isEditing}
              useOptions={useSchoolYearOptions}
            />
            <TextField
              control={form.control}
              name="provider"
              label={t('vaccination.provider')}
              placeholder="ສູນສາທາລະນະສຸກເມືອງ"
            />
            <SelectField
              control={form.control}
              name="status"
              label={t('person.status')}
              options={VACCINATION_CAMPAIGN_STATUSES.map((status) => ({
                value: status,
                label: t(`campaignStatus.${status}`),
              }))}
            />
          </FieldSection>

          {/* The eligibility rule is what makes a round girls-only. It is never
              read off the vaccine, and never off a student's gender — the dose
              count of a girls-only round and the female student count are two
              separate figures. */}
          <FieldSection title={t('vaccination.eligibility')}>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              {t('vaccination.eligibilityHint')}
            </p>
            <SelectField
              control={form.control}
              name="gender"
              label={t('person.gender')}
              clearable
              placeholder={t('vaccination.everyStudent')}
              options={GENDERS.map((gender) => ({ value: gender, label: t(`gender.${gender}`) }))}
            />
            <div className="hidden sm:block" />
            <DateField control={form.control} name="bornFrom" label={t('vaccination.bornFrom')} />
            <DateField control={form.control} name="bornTo" label={t('vaccination.bornTo')} />

            <div className="space-y-2 sm:col-span-2">
              <Label>{t('vaccination.gradeLevels')}</Label>
              <p className="text-xs text-muted-foreground">{t('vaccination.everyGradeHint')}</p>
              <div className="flex flex-wrap gap-x-5 gap-y-2 pt-1">
                {gradeLevels.data?.map((level) => (
                  <label key={level.value} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedGrades.includes(level.value)}
                      onCheckedChange={(checked) =>
                        form.setValue(
                          'gradeLevelIds',
                          checked
                            ? [...selectedGrades, level.value]
                            : selectedGrades.filter((id) => id !== level.value),
                        )
                      }
                    />
                    {level.label}
                  </label>
                ))}
              </div>
            </div>
          </FieldSection>

          <FieldSection>
            <TextareaField
              control={form.control}
              name="notes"
              label={t('common.notes')}
              className="sm:col-span-2"
            />
          </FieldSection>
        </div>
      </Form>
    </FormDialog>
  );
}
