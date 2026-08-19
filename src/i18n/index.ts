import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import { setApiLocale } from '@/lib/api-client';
import type { Locale } from '@/types/enums';
import { en } from './locales/en';
import { lo } from './locales/lo';

const STORAGE_KEY = 'vpsi.locale';
export const SUPPORTED_LOCALES: Locale[] = ['lo', 'en'];

export const LOCALE_LABELS: Record<Locale, string> = {
  lo: 'ລາວ',
  en: 'English',
};

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'lo' || stored === 'en') return stored;
  } catch {
    /* storage unavailable */
  }
  const fromEnv = import.meta.env.VITE_DEFAULT_LOCALE;
  return fromEnv === 'en' ? 'en' : 'lo';
}

const startingLocale = initialLocale();

void i18next.use(initReactI18next).init({
  resources: {
    lo: { translation: lo },
    en: { translation: en },
  },
  lng: startingLocale,
  fallbackLng: 'lo',
  supportedLngs: SUPPORTED_LOCALES,
  interpolation: {
    escapeValue: false, // React escapes on render
  },
  // The catalogues use flat dotted keys for API `messageKey` lookups
  // (`errors.auth.invalidCredentials` would otherwise be read as nesting).
  keySeparator: '.',
  returnNull: false,
});

// Keep the API's Accept-Language header in step with the UI language, so server
// validation messages come back in the same language as the rest of the screen.
setApiLocale(startingLocale);

export function changeLocale(locale: Locale): void {
  void i18next.changeLanguage(locale);
  setApiLocale(locale);
  document.documentElement.lang = locale;
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* storage unavailable */
  }
}

export function currentLocale(): Locale {
  return (i18next.resolvedLanguage as Locale) ?? 'lo';
}

document.documentElement.lang = startingLocale;

export default i18next;
