import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  /** Overrides "Cancel" when declining is a real choice, not an escape hatch. */
  cancelLabel?: string;
  /** `danger` for destructive actions — delete, revoke, close a school year. */
  tone?: 'default' | 'danger';
  isPending?: boolean;
  onConfirm: () => void;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'danger',
  isPending = false,
  onConfirm,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{cancelLabel ?? t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            className={cn(tone === 'danger' && buttonVariants({ variant: 'destructive' }))}
            disabled={isPending}
            onClick={(event) => {
              // Keep the dialog mounted until the mutation settles, so the
              // pending state is visible instead of the row vanishing first.
              event.preventDefault();
              onConfirm();
            }}
          >
            {isPending ? t('common.saving') : (confirmLabel ?? t('common.confirm'))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
