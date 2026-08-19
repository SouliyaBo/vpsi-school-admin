import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useClassroomOptions } from '@/features/classrooms/api';
import { useActiveSchoolYear } from '@/features/school-years/api';
import { errorMessage } from '@/lib/error-message';
import { stripEmpty } from '@/lib/payload';
import { fullName } from '@/lib/utils';
import { notify } from '@/lib/toast';
import { optionalDate, requiredId } from '@/lib/zod-helpers';
import type { Student } from '@/types/entities';
import { Form } from '@/components/ui/form';
import { EntitySelectField } from '@/components/common/EntitySelect';
import { DateField, FieldSection } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { useEnroll, type EnrollmentInput } from '../api';

const schema = z.object({
  classroomId: requiredId(),
  enrolledAt: optionalDate(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: Pick<Student, 'id' | 'firstNameLo' | 'lastNameLo' | 'firstNameEn' | 'lastNameEn'> | null;
  onEnrolled?: () => void;
}

/**
 * Places one student in a classroom.
 *
 * Failures here are expected rather than exceptional — the classroom fills up, or
 * the student already has a placement this year — so the API's message is shown
 * inline beside the picker, where the user can just choose another class.
 */
export function EnrollDialog({ open, onOpenChange, student, onEnrolled }: Props) {
  const { t, i18n } = useTranslation();
  const enroll = useEnroll();
  const activeYear = useActiveSchoolYear();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { classroomId: '', enrolledAt: '' },
  });

  useEffect(() => {
    if (open) {
      form.reset({ classroomId: '', enrolledAt: '' });
      enroll.reset();
    }
    // `enroll` is a stable mutation object; re-running on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form]);

  // Placement is per school year, and the API derives the year from the
  // classroom — so with no active year there are no classrooms to choose from.
  const useOptions = (search: string) => useClassroomOptions(search, activeYear.data?.id);

  function submit(values: FormValues) {
    if (!student) return;

    enroll
      .mutateAsync(stripEmpty({ ...values, studentId: student.id }) as EnrollmentInput)
      .then(() => {
        notify.success(t('toast.created'));
        onEnrolled?.();
        onOpenChange(false);
      })
      .catch(() => {
        /* rendered inline below */
      });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('enrollment.enrollTitle', { name: fullName(student, i18n.language) })}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={enroll.isPending}
      submitLabel={t('enrollment.enroll')}
    >
      <Form {...form}>
        <div className="space-y-4">
          {!activeYear.data && !activeYear.isLoading && (
            <p className="flex items-start gap-2 rounded-md bg-warning-subtle px-3 py-2 text-sm text-warning">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {t('enrollment.noActiveYearHint')}
            </p>
          )}

          {enroll.isError && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {errorMessage(enroll.error)}
            </p>
          )}

          <FieldSection columns={1}>
            <EntitySelectField
              control={form.control}
              name="classroomId"
              label={t('enrollment.classroom')}
              description={t('classroom.occupancy')}
              required
              useOptions={useOptions}
              searchPlaceholder={t('enrollment.selectClassroom')}
            />
            <DateField
              control={form.control}
              name="enrolledAt"
              label={t('enrollment.enrolledAt')}
              description={t('common.optional')}
            />
          </FieldSection>
        </div>
      </Form>
    </FormDialog>
  );
}
