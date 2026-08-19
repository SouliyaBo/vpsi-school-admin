import type { ReactNode } from 'react';
import {
  useFormContext,
  type Control,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

/**
 * Thin wrappers over `FormField` for the field shapes the CRUD forms use over
 * and over. They exist to keep each form readable: a 20-field student form
 * written out with `render={({field}) => …}` for every input hides its own
 * structure.
 */

interface BaseFieldProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  placeholder,
  type = 'text',
  autoComplete,
}: BaseFieldProps<T> & { type?: string; autoComplete?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel required={required}>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              type={type}
              // A controlled input must never receive `undefined` or React
              // switches it to uncontrolled mid-edit.
              value={field.value ?? ''}
              placeholder={placeholder}
              disabled={disabled}
              autoComplete={autoComplete}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Numeric input that hands the form a `number` (or `undefined` when cleared) —
 * `''` from a blank input would otherwise fail Zod's `z.number()`.
 */
export function NumberField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  placeholder,
  min,
  max,
  step,
}: BaseFieldProps<T> & { min?: number; max?: number; step?: number }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel required={required}>{label}</FormLabel>
          <FormControl>
            <Input
              type="number"
              inputMode="decimal"
              min={min}
              max={max}
              step={step}
              placeholder={placeholder}
              disabled={disabled}
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={field.value ?? ''}
              onChange={(event) => {
                const raw = event.target.value;
                field.onChange(raw === '' ? undefined : Number(raw));
              }}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

/**
 * Native date input.
 *
 * `<input type="date">` gives keyboard entry, the OS locale format and mobile
 * pickers for free, and its value is already the `yyyy-MM-dd` the API expects.
 */
export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  min,
  max,
}: BaseFieldProps<T> & { min?: string; max?: string }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel required={required}>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              type="date"
              value={field.value ?? ''}
              min={min}
              max={max}
              disabled={disabled}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function TextareaField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  placeholder,
  rows = 3,
}: BaseFieldProps<T> & { rows?: number }) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel required={required}>{label}</FormLabel>
          <FormControl>
            <Textarea
              {...field}
              value={field.value ?? ''}
              rows={rows}
              placeholder={placeholder}
              disabled={disabled}
            />
          </FormControl>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function SelectField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  required,
  disabled,
  className,
  placeholder,
  options,
  /** Adds a "—" entry that clears the value. */
  clearable = false,
}: BaseFieldProps<T> & { options: SelectOption[]; clearable?: boolean }) {
  const CLEAR = '__clear__';

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={className}>
          <FormLabel required={required}>{label}</FormLabel>
          <Select
            value={field.value ? String(field.value) : ''}
            onValueChange={(value) => field.onChange(value === CLEAR ? undefined : value)}
            disabled={disabled}
          >
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {clearable && (
                <SelectItem value={CLEAR} className="text-muted-foreground">
                  —
                </SelectItem>
              )}
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value} disabled={option.disabled}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FormDescription>{description}</FormDescription>}
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

export function CheckboxField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: Omit<BaseFieldProps<T>, 'placeholder' | 'required'>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem className={cn('flex flex-row items-start gap-2.5 space-y-0 py-1', className)}>
          <FormControl>
            <Checkbox
              checked={Boolean(field.value)}
              onCheckedChange={field.onChange}
              disabled={disabled}
              className="mt-0.5"
            />
          </FormControl>
          <div className="space-y-0.5 leading-none">
            <FormLabel className="cursor-pointer">{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
          </div>
        </FormItem>
      )}
    />
  );
}

export function SwitchField<T extends FieldValues>({
  control,
  name,
  label,
  description,
  disabled,
  className,
}: Omit<BaseFieldProps<T>, 'placeholder' | 'required'>) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem
          className={cn(
            'flex flex-row items-center justify-between gap-4 space-y-0 rounded-md border border-border p-3',
            className,
          )}
        >
          <div className="space-y-0.5">
            <FormLabel>{label}</FormLabel>
            {description && <FormDescription>{description}</FormDescription>}
          </div>
          <FormControl>
            <Switch checked={Boolean(field.value)} onCheckedChange={field.onChange} disabled={disabled} />
          </FormControl>
        </FormItem>
      )}
    />
  );
}

/** Groups related fields with a heading inside a long form. */
export function FieldSection({
  title,
  children,
  className,
  columns = 2,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  columns?: 1 | 2 | 3;
}) {
  return (
    <fieldset className={cn('space-y-3', className)}>
      {title && (
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </legend>
      )}
      <div
        className={cn(
          'grid gap-3',
          columns === 1 && 'grid-cols-1',
          columns === 2 && 'sm:grid-cols-2',
          columns === 3 && 'sm:grid-cols-2 lg:grid-cols-3',
        )}
      >
        {children}
      </div>
    </fieldset>
  );
}

/**
 * Applies field errors returned by the API onto the form.
 *
 * The API's ValidationPipe rejects unknown/invalid properties with a `details`
 * array; mapping those onto inputs is better than a toast that does not say
 * which field is wrong.
 */
export function useApplyServerErrors<T extends FieldValues>() {
  const form = useFormContext<T>();

  return (fieldErrors: { field: string; message: string }[]) => {
    for (const { field, message } of fieldErrors) {
      form.setError(field as FieldPath<T>, { type: 'server', message });
    }
  };
}
