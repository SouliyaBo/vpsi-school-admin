import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';
import {
  Controller,
  FormProvider,
  get,
  useFormContext,
  useFormState,
  type Control,
  type ControllerProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { translateFormMessage } from '@/lib/form-message';
import { cn } from '@/lib/utils';
import { Label } from './label';

/**
 * react-hook-form bindings for the field primitives.
 *
 * `FormField` wires a control to `Controller`; the pieces below read that
 * context to hook up `id`, `aria-describedby` and `aria-invalid` so labels,
 * hints and error messages are announced correctly without per-form plumbing.
 */

const Form = FormProvider;

interface FormFieldContextValue {
  name: string;
}

const FormFieldContext = React.createContext<FormFieldContextValue | null>(null);
const FormItemContext = React.createContext<{ id: string } | null>(null);

function useFormField() {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  if (!fieldContext) throw new Error('useFormField must be used inside <FormField>');
  const state = getFieldState(fieldContext.name, formState);
  const id = itemContext?.id ?? fieldContext.name;

  return {
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...state,
  };
}

function FormField<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
>({ ...props }: ControllerProps<TFieldValues, TName>) {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

const FormItem = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => {
    const id = React.useId();
    return (
      <FormItemContext.Provider value={{ id }}>
        <div ref={ref} className={cn('space-y-1.5', className)} {...props} />
      </FormItemContext.Provider>
    );
  },
);
FormItem.displayName = 'FormItem';

const FormLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.ComponentPropsWithoutRef<typeof Label> & { required?: boolean }
>(({ className, required, children, ...props }, ref) => {
  const { error, formItemId } = useFormField();
  return (
    <Label ref={ref} className={cn(error && 'text-danger', className)} htmlFor={formItemId} {...props}>
      {children}
      {required && (
        <span className="ms-0.5 text-danger" aria-hidden>
          *
        </span>
      )}
    </Label>
  );
});
FormLabel.displayName = 'FormLabel';

const FormControl = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<typeof Slot>>(
  ({ ...props }, ref) => {
    const { error, formItemId, formDescriptionId, formMessageId } = useFormField();
    return (
      <Slot
        ref={ref}
        id={formItemId}
        aria-describedby={error ? `${formDescriptionId} ${formMessageId}` : formDescriptionId}
        aria-invalid={Boolean(error)}
        {...props}
      />
    );
  },
);
FormControl.displayName = 'FormControl';

const FormDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => {
    const { formDescriptionId } = useFormField();
    return (
      <p ref={ref} id={formDescriptionId} className={cn('text-xs text-muted-foreground', className)} {...props} />
    );
  },
);
FormDescription.displayName = 'FormDescription';

/**
 * Renders the active validation error, or nothing when the field is valid.
 *
 * Zod stores i18n keys rather than sentences (see `lib/form-message`), so the
 * message is translated here — which is also what makes validation text follow
 * the language switcher.
 */
const FormMessage = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, children, ...props }, ref) => {
    const { t } = useTranslation();
    const { error, formMessageId } = useFormField();
    const body = error?.message ? translateFormMessage(t, String(error.message)) : children;
    if (!body) return null;

    return (
      <p ref={ref} id={formMessageId} className={cn('text-xs font-medium text-danger', className)} {...props}>
        {body}
      </p>
    );
  },
);
FormMessage.displayName = 'FormMessage';

/**
 * Error text for a rule that belongs to a group of fields rather than to one
 * input — "at least one guardian", "exactly one guardian must be primary".
 *
 * `FormMessage` cannot serve this: it reads the enclosing `FormField` context,
 * and a group-level rule has no such field. This one is addressed by name.
 */
function FieldsetMessage<T extends FieldValues>({
  control,
  name,
  className,
}: {
  control: Control<T>;
  name: FieldPath<T>;
  className?: string;
}) {
  const { t } = useTranslation();
  const { errors } = useFormState({ control, name });

  const error = get(errors, name) as
    | { message?: unknown; root?: { message?: unknown } }
    | undefined;
  // A refine on an array field lands either directly on the array or under
  // `root`, depending on whether per-item errors were written first.
  const raw = error?.message ?? error?.root?.message;
  if (typeof raw !== 'string' || !raw) return null;

  return (
    <p role="alert" className={cn('text-xs font-medium text-danger', className)}>
      {translateFormMessage(t, raw)}
    </p>
  );
}

export {
  FieldsetMessage,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
};
