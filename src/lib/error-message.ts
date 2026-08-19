import i18next from 'i18next';
import { toApiError } from './api-error';

/**
 * Turns anything thrown by the API layer into a sentence for a human.
 *
 * Preference order:
 *   1. the frontend's translation of the API's `messageKey` — same language as
 *      the rest of the screen, and stable when backend wording changes;
 *   2. the API's own `message`, which the backend already localised from
 *      `Accept-Language`;
 *   3. a generic fallback.
 */
export function errorMessage(error: unknown): string {
  const apiError = toApiError(error);

  if (apiError.messageKey) {
    const key = `errors.${apiError.messageKey}`;
    const translated = i18next.t(key);
    if (translated !== key) return translated;
  }

  if (apiError.status === 0) return i18next.t('errors.common.networkError');
  return apiError.message || i18next.t('errors.unexpected');
}

/**
 * Extra line for a duplicate-key conflict, naming the colliding fields.
 * `["studentCode"]` → `studentCode`.
 */
export function conflictHint(error: unknown): string | undefined {
  const apiError = toApiError(error);
  const fields = apiError.duplicateFields;
  return fields.length ? fields.join(', ') : undefined;
}
