import { Check, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { changeLocale, LOCALE_LABELS, SUPPORTED_LOCALES } from '@/i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Switches the UI language and the API's `Accept-Language` together, so
 * server-side validation messages arrive in the language on screen.
 */
export function LocaleSwitcher({ onPrimary = false }: { onPrimary?: boolean }) {
  const { t, i18n } = useTranslation();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t('common.language')}
          className={cn('gap-1.5', onPrimary && 'text-primary-foreground hover:bg-primary-foreground/10')}
        >
          <Languages />
          <span className="text-xs font-medium uppercase">{i18n.resolvedLanguage}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {SUPPORTED_LOCALES.map((locale) => (
          <DropdownMenuItem key={locale} onSelect={() => changeLocale(locale)}>
            <span className="flex-1">{LOCALE_LABELS[locale]}</span>
            {i18n.resolvedLanguage === locale && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
