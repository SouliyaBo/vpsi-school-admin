import { GraduationCap } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { LocaleSwitcher } from '@/components/layout/LocaleSwitcher';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Shell for the unauthenticated screens (login, forgot, reset).
 *
 * The school's name comes from the environment so a deployment can be branded
 * without touching code; drop a logo at `public/logo.svg` to replace the mark.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const schoolName =
    (i18n.language === 'en'
      ? import.meta.env.VITE_SCHOOL_NAME_EN
      : import.meta.env.VITE_SCHOOL_NAME_LO) ?? 'VPSI School';

  return (
    <div className="flex min-h-dvh flex-col bg-primary">
      <div className="flex items-center justify-end p-4">
        <LocaleSwitcher onPrimary />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-3 text-center text-primary-foreground">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-primary-foreground/10 ring-1 ring-primary-foreground/20">
              <GraduationCap className="size-7" aria-hidden />
            </div>
            <div>
              <p className="text-lg font-semibold">{schoolName}</p>
              <p className="text-sm text-primary-foreground/70">{t('common.appName')}</p>
            </div>
          </div>

          <Card className="shadow-xl">
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              {description && <CardDescription>{description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4">{children}</CardContent>
          </Card>

          {footer && <div className="text-center text-sm text-primary-foreground/80">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
