import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { vmsg } from '@/lib/form-message';
import { refId } from '@/lib/utils';
import { optionalId, optionalPhone, optionalText } from '@/lib/zod-helpers';
import { GUARDIAN_RELATIONSHIPS } from '@/types/enums';
import type { Student } from '@/types/entities';
import { Form } from '@/components/ui/form';
import { FormDialog } from '@/components/common/FormDialog';
import {
  GuardianLinksField,
  toGuardianPayload,
  type GuardianLinkValue,
} from './GuardianLinksField';
import { useSetStudentGuardians } from '../api';

const linkSchema = z
  .object({
    mode: z.enum(['existing', 'new']),
    guardianId: optionalId(),
    firstNameLo: optionalText(80),
    lastNameLo: optionalText(80),
    phone: optionalPhone(),
    relationship: z.enum(GUARDIAN_RELATIONSHIPS),
    isPrimary: z.boolean().optional(),
    isEmergencyContact: z.boolean().optional(),
    canViewRecords: z.boolean().optional(),
  })
  .superRefine((link, ctx) => {
    if (link.mode === 'existing') {
      if (!link.guardianId)
        ctx.addIssue({ code: 'custom', path: ['guardianId'], message: vmsg('validation.required') });
      return;
    }
    if (!link.firstNameLo)
      ctx.addIssue({ code: 'custom', path: ['firstNameLo'], message: vmsg('validation.required') });
    if (!link.lastNameLo)
      ctx.addIssue({ code: 'custom', path: ['lastNameLo'], message: vmsg('validation.required') });
    if (!link.phone)
      ctx.addIssue({ code: 'custom', path: ['phone'], message: vmsg('validation.required') });
  });

const schema = z
  .object({ guardians: z.array(linkSchema) })
  .refine((values) => values.guardians.length > 0, {
    path: ['guardians'],
    message: vmsg('student.atLeastOneGuardian'),
  })
  .refine((values) => values.guardians.filter((link) => link.isPrimary).length === 1, {
    path: ['guardians'],
    message: vmsg('student.primaryGuardianRequired'),
  });

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Student;
  onSaved?: () => void;
}

/**
 * Replaces a student's guardian list.
 *
 * `PUT /students/:id/guardians` takes the whole list, so the form starts from the
 * current one — submitting a shorter list is how a guardian gets unlinked.
 */
export function GuardianLinksDialog({ open, onOpenChange, student, onSaved }: Props) {
  const { t } = useTranslation();
  const save = useSetStudentGuardians(student.id);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { guardians: [] },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      // Existing links always map to `existing` mode: the guardian records are
      // already on file, and editing their details belongs on the guardian page.
      guardians: student.guardians.map<GuardianLinkValue>((link) => ({
        mode: 'existing',
        guardianId: refId(link.guardianId) ?? '',
        firstNameLo: '',
        lastNameLo: '',
        phone: '',
        relationship: link.relationship,
        isPrimary: link.isPrimary,
        isEmergencyContact: link.isEmergencyContact,
        canViewRecords: link.canViewRecords,
      })),
    });
  }, [open, student, form]);

  function submit(values: FormValues) {
    void save
      .mutateAsync(toGuardianPayload(values.guardians))
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
      title={t('student.guardians')}
      description={t('student.guardiansHint')}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={save.isPending}
      size="xl"
    >
      <Form {...form}>
        <GuardianLinksField control={form.control} name="guardians" />
      </Form>
    </FormDialog>
  );
}
