import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { optionalText } from '@/lib/zod-helpers';
import type { Enrollment } from '@/types/entities';
import { Form } from '@/components/ui/form';
import { FieldSection, TextField } from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import { useUpdateEnrollment } from '../api';

const schema = z.object({
  englishClass: optionalText(50),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  /** The placement being edited; `null` keeps the dialog closed. */
  enrollment: Enrollment | null;
  onClose: () => void;
}

/**
 * Sets `ຫ້ອງພາກອັງກິດ` on a placement that already exists.
 *
 * Its own dialog rather than a field on the student form, because the room is a
 * property of the placement: it is re-made every school year, and editing it
 * from the student record would silently write to whichever year happened to be
 * active.
 *
 * `stripEmpty` is deliberately *not* used on submit — a cleared box has to reach
 * the API as `''` so it can unset the room, and stripping it would send nothing
 * and leave the old value in place.
 */
export function EnglishClassDialog({ enrollment, onClose }: Props) {
  const { t } = useTranslation();
  const update = useUpdateEnrollment();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { englishClass: '' },
  });

  useEffect(() => {
    if (enrollment) form.reset({ englishClass: enrollment.englishClass ?? '' });
  }, [enrollment, form]);

  function submit(values: FormValues) {
    if (!enrollment) return;

    update
      .mutateAsync({ id: enrollment.id, body: { englishClass: values.englishClass ?? '' } })
      .then(onClose)
      .catch(() => {});
  }

  return (
    <FormDialog
      open={enrollment !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t('enrollment.englishClassEdit')}
      description={
        enrollment
          ? `${enrollment.studentCode} — ${enrollment.studentNameLo}`
          : undefined
      }
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={update.isPending}
    >
      <Form {...form}>
        <FieldSection columns={1}>
          <TextField
            control={form.control}
            name="englishClass"
            label={t('enrollment.englishClass')}
            description={t('enrollment.englishClassHint')}
          />
        </FieldSection>
      </Form>
    </FormDialog>
  );
}
