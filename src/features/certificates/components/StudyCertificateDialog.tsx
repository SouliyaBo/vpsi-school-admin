import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, Eye } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { notify } from '@/lib/toast';
import { optionalText } from '@/lib/zod-helpers';
import { formatDate } from '@/lib/utils';
import type { Student } from '@/types/entities';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { FieldSection, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useIssueStudyCertificate,
  usePreviewStudyCertificate,
  useStudyCertificatePrefill,
  type StudyCertificateField,
} from '../api';

const schema = z.object({
  birthPlaceLo: optionalText(200),
  fatherNameLo: optionalText(120),
  motherNameLo: optionalText(120),
  currentAddressLo: optionalText(200),
  studyFromYearCode: optionalText(20),
  studyToYearCode: optionalText(20),
  classLabelLo: optionalText(30),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  birthPlaceLo: '',
  fatherNameLo: '',
  motherNameLo: '',
  currentAddressLo: '',
  studyFromYearCode: '',
  studyToYearCode: '',
  classLabelLo: '',
};

interface Props {
  student: Student | null;
  onClose: () => void;
}

/**
 * Writes a ໃບຢັ້ງຢືນການສຶກສາ for one pupil and hands back the PDF.
 *
 * A review step rather than a straight download button, because most of what
 * the letter states is not in the register: the school holds a birthplace for
 * one pupil on its whole roll, and a pupil's enrollment history usually starts
 * at the year the system did — so the study period reads as one year for a child
 * who has been here four. Both are stated as fact on a signed document, so both
 * are shown for correction before a number is spent on them.
 *
 * Anything left blank still prints, as a dotted run for the office to complete
 * by hand. That is how the school's own form is used, and it beats blocking the
 * letter over a field nobody at the counter can answer.
 */
export function StudyCertificateDialog({ student, onClose }: Props) {
  const { t } = useTranslation();
  const open = Boolean(student);
  const prefill = useStudyCertificatePrefill(student?.id, open);
  const preview = usePreviewStudyCertificate();
  const issue = useIssueStudyCertificate();

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  // The draft arrives after the dialog opens, so the form is filled on arrival
  // rather than at mount.
  useEffect(() => {
    if (!prefill.data) return;
    form.reset({
      birthPlaceLo: prefill.data.birthPlaceLo ?? '',
      fatherNameLo: prefill.data.fatherNameLo ?? '',
      motherNameLo: prefill.data.motherNameLo ?? '',
      currentAddressLo: prefill.data.currentAddressLo ?? '',
      studyFromYearCode: prefill.data.studyFromYearCode ?? '',
      studyToYearCode: prefill.data.studyToYearCode ?? '',
      classLabelLo: prefill.data.classLabelLo ?? '',
    });
  }, [prefill.data, form]);

  useEffect(() => {
    if (!open) form.reset(EMPTY);
  }, [open, form]);

  if (!student) return null;

  const missing = prefill.data?.missing ?? [];
  const isMissing = (field: StudyCertificateField): boolean => missing.includes(field);

  const submit = (values: FormValues, action: 'preview' | 'issue'): void => {
    const input = { studentId: student.id, ...values };
    if (action === 'preview') {
      preview.mutate(input);
      return;
    }
    issue.mutate(input, {
      onSuccess: ({ certificateNumber }) => {
        // The number is spent and unrepeatable, and the office writes it into
        // its own book — so it is said out loud rather than left in a filename.
        if (certificateNumber) {
          notify.success(t('certificate.issued'), `${t('certificate.number')} ${certificateNumber}`);
        }
        onClose();
      },
    });
  };

  const busy = preview.isPending || issue.isPending;

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      size="lg"
      title={t('certificate.studyVerification')}
      description={
        prefill.data
          ? `${prefill.data.titleLo} ${prefill.data.fullNameLo} · ${prefill.data.studentCode}` +
            (prefill.data.dateOfBirth ? ` · ${formatDate(prefill.data.dateOfBirth)}` : '')
          : student.studentCode
      }
      onSubmit={form.handleSubmit((values) => submit(values, 'issue'))}
      isSubmitting={issue.isPending}
      submitLabel={t('certificate.issue')}
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

          <FieldSection title={t('certificate.aboutStudent')} columns={1}>
            <TextField
              control={form.control}
              name="birthPlaceLo"
              label={t('certificate.birthPlace')}
              placeholder={t('certificate.addressPlaceholder')}
              description={isMissing('birthPlaceLo') ? t('certificate.notOnFile') : undefined}
            />
            <TextField
              control={form.control}
              name="currentAddressLo"
              label={t('certificate.currentAddress')}
              placeholder={t('certificate.addressPlaceholder')}
              description={isMissing('currentAddressLo') ? t('certificate.notOnFile') : undefined}
            />
          </FieldSection>

          <FieldSection title={t('certificate.parents')} columns={2}>
            <TextField
              control={form.control}
              name="fatherNameLo"
              label={t('relationship.father')}
              description={isMissing('fatherNameLo') ? t('certificate.notOnFile') : undefined}
            />
            <TextField
              control={form.control}
              name="motherNameLo"
              label={t('relationship.mother')}
              description={isMissing('motherNameLo') ? t('certificate.notOnFile') : undefined}
            />
          </FieldSection>

          <FieldSection title={t('certificate.attendance')} columns={3}>
            <TextField
              control={form.control}
              name="studyFromYearCode"
              label={t('certificate.fromYear')}
              placeholder="2022-2023"
              description={t('certificate.fromYearHint')}
            />
            <TextField
              control={form.control}
              name="studyToYearCode"
              label={t('certificate.toYear')}
              placeholder="2025-2026"
            />
            <TextField
              control={form.control}
              name="classLabelLo"
              label={t('certificate.classLabel')}
              placeholder="ມ.4"
            />
          </FieldSection>
        </Form>
      )}
    </FormDialog>
  );
}
