import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { vmsg } from '@/lib/form-message';
import { optionalText, requiredText } from '@/lib/zod-helpers';
import { Form } from '@/components/ui/form';
import {
  CheckboxField,
  FieldSection,
  SelectField,
  TextareaField,
  TextField,
} from '@/components/common/fields';
import { FormDialog } from '@/components/common/FormDialog';
import type { SettingInput } from '../api';

/** Same shape the API's `UpsertSettingDto` accepts: dot-separated segments. */
const KEY_PATTERN = /^[a-z0-9]+(\.[a-z0-9]+)*$/i;

const VALUE_TYPES = ['text', 'number', 'boolean', 'json'] as const;

const schema = z
  .object({
    key: requiredText(100).regex(KEY_PATTERN, vmsg('setting.invalidKey')),
    category: requiredText(50),
    description: optionalText(300),
    valueType: z.enum(VALUE_TYPES),
    /** The value as typed; interpreted according to `valueType`. */
    raw: z.string().max(5000, vmsg('validation.maxLength', { max: 5000 })),
    flag: z.boolean(),
    isPublic: z.boolean(),
  })
  .superRefine((values, context) => {
    if (values.valueType === 'number' && !Number.isFinite(Number(values.raw.trim() || NaN))) {
      context.addIssue({ code: 'custom', path: ['raw'], message: vmsg('setting.valueRequired') });
    }
    if (values.valueType === 'json') {
      try {
        JSON.parse(values.raw);
      } catch {
        context.addIssue({ code: 'custom', path: ['raw'], message: vmsg('setting.invalidJson') });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  key: '',
  category: 'general',
  description: '',
  valueType: 'text',
  raw: '',
  flag: false,
  isPublic: false,
};

interface AddSettingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isSubmitting: boolean;
  onSubmit: (input: SettingInput) => void;
}

/**
 * Creates a setting the seed does not define.
 *
 * `PUT /settings` is an upsert, so this is the same call the rows use — which
 * also means an existing key typed in here **overwrites** that setting rather
 * than failing. The key field says so.
 *
 * The type picker exists because the value is stored as raw JSON: without it,
 * saving the string `Vientiane` would mean typing `"Vientiane"`, quotes and
 * all, and a value saved without them silently becomes invalid JSON.
 */
export function AddSettingDialog({
  open,
  onOpenChange,
  isSubmitting,
  onSubmit,
}: AddSettingDialogProps) {
  const { t } = useTranslation();
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (open) form.reset(EMPTY);
  }, [open, form]);

  const valueType = form.watch('valueType');

  function submit(values: FormValues) {
    let value: unknown;
    switch (values.valueType) {
      case 'number':
        value = Number(values.raw.trim());
        break;
      case 'boolean':
        value = values.flag;
        break;
      case 'json':
        value = JSON.parse(values.raw) as unknown;
        break;
      default:
        value = values.raw;
    }

    onSubmit({
      key: values.key.trim(),
      value,
      category: values.category.trim(),
      description: values.description?.trim() || undefined,
      isPublic: values.isPublic,
    });
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('setting.create')}
      description={t('setting.createHint')}
      onSubmit={form.handleSubmit(submit)}
      isSubmitting={isSubmitting}
      size="lg"
    >
      <Form {...form}>
        <FieldSection>
          <TextField
            control={form.control}
            name="key"
            label={t('setting.key')}
            description={t('setting.keyHint')}
            required
            placeholder="school.website"
          />
          <TextField
            control={form.control}
            name="category"
            label={t('setting.category')}
            description={t('setting.categoryHint')}
            required
          />
          <SelectField
            control={form.control}
            name="valueType"
            label={t('setting.valueType')}
            options={VALUE_TYPES.map((type) => ({
              value: type,
              label: t(`setting.type.${type}`),
            }))}
            required
          />

          {valueType === 'boolean' ? (
            <CheckboxField control={form.control} name="flag" label={t('setting.value')} />
          ) : valueType === 'json' ? (
            <TextareaField
              control={form.control}
              name="raw"
              label={t('setting.value')}
              description={t('setting.jsonHint')}
              className="sm:col-span-2"
              rows={6}
              placeholder='{ "example": true }'
            />
          ) : (
            <TextField
              control={form.control}
              name="raw"
              label={t('setting.value')}
              type={valueType === 'number' ? 'number' : 'text'}
              required={valueType === 'number'}
            />
          )}

          <TextareaField
            control={form.control}
            name="description"
            label={t('common.description')}
            description={t('setting.descriptionHint')}
            className="sm:col-span-2"
            rows={2}
          />
          <CheckboxField
            control={form.control}
            name="isPublic"
            label={t('setting.public')}
            description={t('setting.publicWarning')}
            className="sm:col-span-2"
          />
        </FieldSection>
      </Form>
    </FormDialog>
  );
}
