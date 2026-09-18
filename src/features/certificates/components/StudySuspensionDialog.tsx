import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Eye } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { notify } from '@/lib/toast';
import { vmsg } from '@/lib/form-message';
import { optionalDate, optionalText } from '@/lib/zod-helpers';
import type { Student } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import {
  CheckboxField,
  DateField,
  FieldSection,
  SelectField,
  TextField,
} from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useIssueStudySuspension,
  usePreviewStudySuspension,
  useStudySuspensionPrefill,
  type StudySuspensionField,
  type StudySuspensionInput,
} from '../api';
import {
  OTHER,
  REPORT_CARD_LEVELS,
  RETURNED_DOCUMENTS,
  STUDY_ABROAD,
  STUDY_ABROAD_COUNTRIES,
  SUSPENSION_REASONS,
  reportCardLabel,
  studyAbroadLabel,
} from '../suspension-options';

const schema = z.object({
  guardianNameLo: optionalText(120),
  guardianPhone: optionalText(40),
  villageLo: optionalText(120),
  districtLo: optionalText(120),
  provinceLo: optionalText(120),
  classLabelLo: optionalText(30),
  schoolYearCode: optionalText(20),
  suspendedFrom: optionalDate(),
  /** One of `SUSPENSION_REASONS`, `OTHER`, or empty for ruled lines. */
  reason: z.string().optional(),
  reasonOther: optionalText(300),
  /** One of `STUDY_ABROAD_COUNTRIES` or `OTHER`; only read when abroad is the reason. */
  country: z.string().optional(),
  countryOther: optionalText(100),
  /** Which of `RETURNED_DOCUMENTS` are handed back, by index. */
  documents: z.array(z.boolean()),
  reportCard: z.boolean(),
  reportCardLevel: z.string().optional(),
  documentOther: optionalText(200),
});

/** "Other" and the report card each need their second half filled in. */
const schemaWithPairs = schema.superRefine((values, ctx) => {
  if (values.reason === OTHER && !(values.reasonOther ?? '').trim()) {
    ctx.addIssue({ code: 'custom', path: ['reasonOther'], message: vmsg('validation.required') });
  }
  if (values.reason === STUDY_ABROAD) {
    if (!values.country) {
      ctx.addIssue({ code: 'custom', path: ['country'], message: vmsg('validation.required') });
    } else if (values.country === OTHER && !(values.countryOther ?? '').trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['countryOther'],
        message: vmsg('validation.required'),
      });
    }
  }
  if (values.reportCard && !values.reportCardLevel) {
    ctx.addIssue({
      code: 'custom',
      path: ['reportCardLevel'],
      message: vmsg('validation.required'),
    });
  }
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  guardianNameLo: '',
  guardianPhone: '',
  villageLo: '',
  districtLo: '',
  provinceLo: '',
  classLabelLo: '',
  schoolYearCode: '',
  suspendedFrom: '',
  reason: '',
  reasonOther: '',
  country: '',
  countryOther: '',
  documents: RETURNED_DOCUMENTS.map(() => false),
  reportCard: false,
  reportCardLevel: '',
  documentOther: '',
};

/**
 * What the memo prints for the reason and the documents, from the choices made.
 *
 * Composed here rather than sent as choices because the API stores and prints
 * text: the office's list can change without a memo already issued changing
 * with it.
 */
function toPrinted(values: FormValues): Pick<StudySuspensionInput, 'reasonLo' | 'documentsLo'> {
  let reasonLo = values.reason;
  if (values.reason === OTHER) reasonLo = (values.reasonOther ?? '').trim();
  if (values.reason === STUDY_ABROAD) {
    const country =
      values.country === OTHER ? (values.countryOther ?? '').trim() : (values.country ?? '');
    reasonLo = country ? studyAbroadLabel(country) : STUDY_ABROAD;
  }

  const documentsLo = RETURNED_DOCUMENTS.filter((_, index) => values.documents[index]);
  if (values.reportCard && values.reportCardLevel) {
    documentsLo.push(reportCardLabel(values.reportCardLevel));
  }
  const other = (values.documentOther ?? '').trim();
  if (other) documentsLo.push(other);

  return { reasonLo: reasonLo || undefined, documentsLo };
}

interface Props {
  student: Student | null;
  onClose: () => void;
}

/**
 * Writes a ບົດບັນທຶກ ຂໍໂຈະການຮຽນ for one pupil and hands back the PDF.
 *
 * The same review-then-issue shape as the study certificate, for the same
 * reason: the memo states who the guardian is and where they live as fact, and
 * both come from a register that is often wrong or empty. The reason for the
 * suspension and the documents handed back are deliberately not here — they
 * are written by hand at the counter and print as ruled lines.
 */
export function StudySuspensionDialog({ student, onClose }: Props) {
  const { t } = useTranslation();
  const open = Boolean(student);
  const prefill = useStudySuspensionPrefill(student?.id, open);
  const preview = usePreviewStudySuspension();
  const issue = useIssueStudySuspension();

  const form = useForm<FormValues>({
    resolver: zodResolver(schemaWithPairs),
    defaultValues: EMPTY,
  });

  useEffect(() => {
    if (!prefill.data) return;
    form.reset({
      ...EMPTY,
      guardianNameLo: prefill.data.guardianNameLo ?? '',
      guardianPhone: prefill.data.guardianPhone ?? '',
      villageLo: prefill.data.villageLo ?? '',
      districtLo: prefill.data.districtLo ?? '',
      provinceLo: prefill.data.provinceLo ?? '',
      classLabelLo: prefill.data.classLabelLo ?? '',
      schoolYearCode: prefill.data.schoolYearCode ?? '',
      suspendedFrom: prefill.data.suspendedFrom ?? '',
    });
  }, [prefill.data, form]);

  useEffect(() => {
    if (!open) form.reset(EMPTY);
  }, [open, form]);

  if (!student) return null;

  const missing = prefill.data?.missing ?? [];
  const isMissing = (field: StudySuspensionField): boolean => missing.includes(field);

  const submit = (values: FormValues, action: 'preview' | 'issue'): void => {
    const {
      reason: _reason,
      reasonOther: _reasonOther,
      country: _country,
      countryOther: _countryOther,
      documents: _documents,
      reportCard: _reportCard,
      reportCardLevel: _reportCardLevel,
      documentOther: _documentOther,
      suspendedFrom,
      ...fields
    } = values;
    const input: StudySuspensionInput = {
      studentId: student.id,
      ...fields,
      // The text fields may go as '' (it means "clear"); a blank date may not —
      // the API validates it as a date and there is no "clear" for a default.
      ...(suspendedFrom ? { suspendedFrom } : {}),
      ...toPrinted(values),
    };
    if (action === 'preview') {
      preview.mutate(input);
      return;
    }
    issue.mutate(input, {
      onSuccess: ({ certificateNumber }) => {
        if (certificateNumber) {
          notify.success(
            t('certificate.issued'),
            `${t('certificate.number')} ${certificateNumber}`,
          );
        }
        onClose();
      },
    });
  };

  const busy = preview.isPending || issue.isPending;
  const reason = form.watch('reason');
  const country = form.watch('country');
  const reportCard = form.watch('reportCard');

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      size="lg"
      title={t('certificate.studySuspension')}
      description={
        prefill.data
          ? `${prefill.data.titleLo} ${prefill.data.fullNameLo} · ${prefill.data.studentCode}`
          : student.studentCode
      }
      onSubmit={form.handleSubmit((values) => submit(values, 'issue'))}
      isSubmitting={issue.isPending}
      submitLabel={t('certificate.issueMemo')}
      footerStart={
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={form.handleSubmit((values) => submit(values, 'preview'))}
        >
          <Eye />
          {t('certificate.preview')}
        </Button>
      }
    >
      {prefill.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <Form {...form}>
          {missing.length > 0 && (
            <p className="mb-4 flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('certificate.missingFields')}
            </p>
          )}

          <FieldSection title={t('certificate.guardian')} columns={2}>
            <TextField
              control={form.control}
              name="guardianNameLo"
              label={t('certificate.guardianName')}
              placeholder="ທ້າວ …"
              description={isMissing('guardianNameLo') ? t('certificate.notOnFile') : undefined}
            />
            <TextField
              control={form.control}
              name="guardianPhone"
              label={t('person.phone')}
              description={isMissing('guardianPhone') ? t('certificate.notOnFile') : undefined}
            />
          </FieldSection>

          <FieldSection title={t('certificate.currentAddress')} columns={3}>
            <TextField
              control={form.control}
              name="villageLo"
              label={t('locationType.village')}
              description={isMissing('villageLo') ? t('certificate.notOnFile') : undefined}
            />
            <TextField
              control={form.control}
              name="districtLo"
              label={t('locationType.district')}
              description={isMissing('districtLo') ? t('certificate.notOnFile') : undefined}
            />
            <TextField
              control={form.control}
              name="provinceLo"
              label={t('locationType.province')}
              description={isMissing('provinceLo') ? t('certificate.notOnFile') : undefined}
            />
          </FieldSection>

          <FieldSection title={t('certificate.suspension')} columns={3}>
            <TextField
              control={form.control}
              name="classLabelLo"
              label={t('certificate.classLabel')}
              placeholder="ມ.1/ກ"
              description={isMissing('classLabelLo') ? t('certificate.notOnFile') : undefined}
            />
            <TextField
              control={form.control}
              name="schoolYearCode"
              label={t('certificate.schoolYear')}
              placeholder="2026-2027"
              description={isMissing('schoolYearCode') ? t('certificate.notOnFile') : undefined}
            />
            <DateField
              control={form.control}
              name="suspendedFrom"
              label={t('certificate.suspendedFrom')}
              description={t('certificate.suspendedFromHint')}
            />
          </FieldSection>

          <FieldSection title={t('certificate.reason')} columns={1}>
            <SelectField
              control={form.control}
              name="reason"
              label={t('certificate.reason')}
              placeholder={t('certificate.reasonPlaceholder')}
              clearable
              options={[
                ...SUSPENSION_REASONS.map((reason) => ({ value: reason, label: reason })),
                { value: OTHER, label: t('certificate.other') },
              ]}
              description={t('certificate.blankPrintsRuled')}
            />
            {reason === OTHER && (
              <TextField
                control={form.control}
                name="reasonOther"
                label={t('certificate.otherReason')}
                required
              />
            )}
            {reason === STUDY_ABROAD && (
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField
                  control={form.control}
                  name="country"
                  label={t('certificate.country')}
                  placeholder={t('certificate.countryPlaceholder')}
                  options={[
                    ...STUDY_ABROAD_COUNTRIES.map((country) => ({
                      value: country,
                      label: country,
                    })),
                    { value: OTHER, label: t('certificate.other') },
                  ]}
                  required
                />
                {country === OTHER && (
                  <TextField
                    control={form.control}
                    name="countryOther"
                    label={t('certificate.otherCountry')}
                    required
                  />
                )}
              </div>
            )}
          </FieldSection>

          <FieldSection title={t('certificate.documents')} columns={1}>
            {RETURNED_DOCUMENTS.map((document, index) => (
              <CheckboxField
                key={document}
                control={form.control}
                name={`documents.${index}` as const}
                label={document}
              />
            ))}
            <div className="grid gap-3 sm:grid-cols-[auto_1fr] sm:items-start">
              <CheckboxField
                control={form.control}
                name="reportCard"
                label={reportCardLabel('…')}
              />
              {reportCard && (
                <SelectField
                  control={form.control}
                  name="reportCardLevel"
                  label={t('certificate.reportCardLevel')}
                  options={REPORT_CARD_LEVELS.map((level) => ({
                    value: level,
                    label: `ມ.${level}`,
                  }))}
                  required
                />
              )}
            </div>
            <TextField
              control={form.control}
              name="documentOther"
              label={t('certificate.other')}
              placeholder={t('certificate.otherDocumentPlaceholder')}
              description={t('certificate.blankPrintsRuled')}
            />
          </FieldSection>
        </Form>
      )}
    </FormDialog>
  );
}
