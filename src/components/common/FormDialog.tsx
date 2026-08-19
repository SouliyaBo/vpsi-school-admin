import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** The form body. Fields should be laid out by the caller. */
  children: ReactNode;
  /** Called on submit — the dialog renders the `<form>` element itself. */
  onSubmit: () => void;
  isSubmitting?: boolean;
  submitLabel?: string;
  /** `lg` / `xl` for forms with two columns, e.g. the student form. */
  size?: 'md' | 'lg' | 'xl';
  /** Rendered at the start of the footer, e.g. a delete button. */
  footerStart?: ReactNode;
}

const SIZES = {
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
} as const;

/**
 * Create/edit dialog used by every module's quick form.
 *
 * The scroll container is the field area only, so the title and the action
 * buttons stay visible on a long form — important for the student form, which
 * does not fit a laptop screen.
 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  onSubmit,
  isSubmitting = false,
  submitLabel,
  size = 'md',
  footerStart,
}: FormDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(SIZES[size])}
        // Closing mid-edit by clicking away loses typed input; the Cancel button
        // and Escape remain available.
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
          className="flex min-h-0 flex-1 flex-col gap-4"
          noValidate
        >
          <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 py-0.5 scrollbar-thin">
            {children}
          </div>

          <DialogFooter className={cn(footerStart && 'sm:justify-between')}>
            {footerStart}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" loading={isSubmitting}>
                {isSubmitting ? t('common.saving') : (submitLabel ?? t('common.save'))}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
