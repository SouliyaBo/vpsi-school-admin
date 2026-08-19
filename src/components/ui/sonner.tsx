import { Toaster as Sonner } from 'sonner';

/**
 * Toast host. Styling comes from the theme tokens rather than sonner's own
 * palette, so success/error toasts match the badges used in tables.
 */
export function Toaster() {
  return (
    <Sonner
      position="top-right"
      closeButton
      duration={5000}
      toastOptions={{
        classNames: {
          toast:
            'group flex w-full items-center gap-3 rounded-lg border border-border bg-background p-4 text-foreground shadow-lg',
          title: 'text-sm font-medium',
          description: 'text-sm text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs font-medium',
          cancelButton: 'bg-muted text-muted-foreground rounded-md px-2 py-1 text-xs',
          success: 'border-success/30 [&_[data-icon]]:text-success',
          error: 'border-danger/30 [&_[data-icon]]:text-danger',
          warning: 'border-warning/30 [&_[data-icon]]:text-warning',
          info: 'border-info/30 [&_[data-icon]]:text-info',
        },
      }}
    />
  );
}
