import type { TFunction } from 'i18next';

/**
 * Zod validation messages are stored as *i18n keys*, not sentences.
 *
 * A schema is evaluated once at module load, so a translated string baked in
 * there would freeze in whatever language was active at import time and never
 * follow the language switcher. Keeping the key and translating in
 * `<FormMessage>` at render time keeps validation text reactive.
 *
 * Interpolation values ride along after `::` — `validation.maxLength::{"max":80}`
 * — because react-hook-form only carries a string.
 */

const SEPARATOR = '::';

export function vmsg(key: string, params?: Record<string, unknown>): string {
  return params ? `${key}${SEPARATOR}${JSON.stringify(params)}` : key;
}

/**
 * Translates a stored message. Anything that is not a known key — notably a
 * sentence the API returned — is passed through unchanged.
 */
export function translateFormMessage(t: TFunction, message: string): string {
  const index = message.indexOf(SEPARATOR);
  const key = index === -1 ? message : message.slice(0, index);

  let params: Record<string, unknown> | undefined;
  if (index !== -1) {
    try {
      params = JSON.parse(message.slice(index + SEPARATOR.length)) as Record<string, unknown>;
    } catch {
      params = undefined;
    }
  }

  return t(key, { ...params, defaultValue: index === -1 ? message : key });
}
