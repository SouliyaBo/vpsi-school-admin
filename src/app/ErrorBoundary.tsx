import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

interface State {
  error: Error | null;
}

/**
 * Last line of defence for a render-time crash.
 *
 * React has no hook equivalent, so this stays a class component. It catches bugs
 * in our own components — API failures are handled by the query layer and never
 * reach here.
 */
class ErrorBoundaryBase extends Component<WithTranslation & { children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Kept as a console error on purpose: there is no client-side error
    // reporting service wired up, and swallowing it silently would make a
    // white-screen bug undebuggable.
    console.error('Unhandled render error', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    const { t, children } = this.props;

    if (!error) return children;

    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-muted p-6 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-danger-subtle text-danger">
          <AlertTriangle className="size-7" aria-hidden />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">{t('errors.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('errors.unexpected')}</p>
        </div>

        {import.meta.env.DEV && (
          <pre className="max-h-48 max-w-2xl overflow-auto rounded-md bg-background p-3 text-start text-xs text-danger scrollbar-thin">
            {error.stack ?? error.message}
          </pre>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={() => this.setState({ error: null })}>
            <RotateCcw />
            {t('common.retry')}
          </Button>
          <Button onClick={() => window.location.assign('/')}>{t('errors.goHome')}</Button>
        </div>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryBase);
