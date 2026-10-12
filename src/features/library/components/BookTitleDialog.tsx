import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  optionalDate,
  optionalNumber,
  optionalText,
  requiredNumber,
  requiredText,
} from '@/lib/zod-helpers';
import { Form } from '@/components/ui/form';
import {
  DateField,
  FieldSection,
  NumberField,
  TextField,
  TextareaField,
} from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import {
  useCreateBookTitle,
  useUpdateBookTitle,
  type BookTitle,
  type BookTitleCategory,
} from '../api';

const schema = z.object({
  title: requiredText(300),
  quantity: requiredNumber({ min: 0, integer: true }),
  unitPrice: optionalNumber({ min: 0 }),
  source: optionalText(200),
  acquiredOn: optionalDate(),
  academicYear: optionalText(20),
  note: optionalText(1000),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  title: '',
  quantity: 1,
  unitPrice: undefined,
  source: '',
  acquiredOn: '',
  academicYear: '',
  note: '',
};

/**
 * Adds or edits one title. On an edit, a field cleared is sent as `null`, which
 * is what tells the API to clear it — a missing field would leave it as it was.
 */
export function BookTitleDialog({
  open,
  onOpenChange,
  category,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: BookTitleCategory;
  title: BookTitle | null;
}) {
  const { t } = useTranslation();
  const create = useCreateBookTitle();
  const update = useUpdateBookTitle();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    form.reset(
      title
        ? {
            title: title.title,
            quantity: title.quantity,
            unitPrice: title.unitPrice ?? undefined,
            source: title.source ?? '',
            acquiredOn: title.acquiredOn ?? '',
            academicYear: title.academicYear ?? '',
            note: title.note ?? '',
          }
        : EMPTY,
    );
  }, [open, title, form]);

  function submit(values: FormValues) {
    const blank = (value: string | undefined) => (value?.trim() ? value.trim() : null);
    const body = {
      category,
      title: values.title.trim(),
      quantity: values.quantity,
      unitPrice: values.unitPrice ?? null,
      source: blank(values.source),
      acquiredOn: blank(values.acquiredOn),
      academicYear: blank(values.academicYear),
      note: blank(values.note),
    };
    const done = () => onOpenChange(false);
    if (title) {
      update.mutateAsync({ id: title.id, ...body }).then(done, () => {});
    } else {
      // A new title has nothing to clear, so the empty fields are simply left out.
      const created = Object.fromEntries(
        Object.entries(body).filter(([, value]) => value !== null),
      ) as typeof body;
      create.mutateAsync(created).then(done, () => {});
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title ? t('library.title.edit') : t(`library.title.create.${category}`)}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={create.isPending || update.isPending}
      size="lg"
    >
      <Form {...form}>
        <FieldSection title={t('library.title.section')}>
          <TextField
            control={form.control}
            name="title"
            label={t('library.title.name')}
            required
            className="sm:col-span-2"
          />
          <NumberField
            control={form.control}
            name="quantity"
            label={t('library.title.quantity')}
            required
            min={0}
          />
          <NumberField
            control={form.control}
            name="unitPrice"
            label={t('library.title.unitPrice')}
            min={0}
          />
          <TextField
            control={form.control}
            name="source"
            label={t('library.title.source')}
            placeholder={category === 'donated' ? 'Book Festival 2026' : undefined}
          />
          <DateField
            control={form.control}
            name="acquiredOn"
            label={t(`library.title.acquiredOn.${category}`)}
          />
          <TextField
            control={form.control}
            name="academicYear"
            label={t('library.title.academicYear')}
            placeholder="2025-2026"
          />
          <TextareaField
            control={form.control}
            name="note"
            label={t('library.title.note')}
            className="sm:col-span-2"
          />
        </FieldSection>
      </Form>
    </FormDialog>
  );
}
