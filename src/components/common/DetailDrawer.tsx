import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ErrorState } from './ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

interface DetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

/** Right-hand drawer for record details, opened from a table row. */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  isLoading = false,
  error,
  onRetry,
  children,
  footer,
  className,
}: DetailDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className={cn('p-0', className)}>
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>

        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-6">
          {error ? (
            <ErrorState error={error} onRetry={onRetry} compact />
          ) : isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            children
          )}
        </div>

        {footer && <SheetFooter>{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}

/** Label/value row used inside the drawer. */
export function DetailRow({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    // Label beside value at every width — stacking them on a phone doubled the
    // height of every row, and a page of forty rows became a long scroll. The
    // label column is fixed narrow there so the value keeps most of the line.
    <div
      className={cn(
        'grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 py-1.5 text-sm sm:grid-cols-3',
        className,
      )}
    >
      <dt className="break-words text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words font-medium sm:col-span-2">{children ?? '—'}</dd>
    </div>
  );
}

export function DetailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('space-y-1', className)}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <dl className="divide-y divide-border">{children}</dl>
    </section>
  );
}
