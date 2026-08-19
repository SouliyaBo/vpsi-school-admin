import { z } from 'zod';
import { vmsg } from './form-message';

/**
 * Field builders shared by every form schema.
 *
 * Two conventions worth knowing:
 *
 *  • **No transforms.** An input schema and its output stay the same type, so
 *    `useForm<z.infer<typeof schema>>` needs no generic gymnastics. Turning a
 *    blank input into an absent key is the job of `stripEmpty()` at submit time
 *    (see `lib/payload`).
 *  • **Messages are i18n keys** (see `lib/form-message`), so validation text
 *    follows the language switcher instead of freezing at import time.
 */

export const requiredText = (max: number) =>
  z
    .string({ required_error: vmsg('validation.required') })
    .trim()
    .min(1, vmsg('validation.required'))
    .max(max, vmsg('validation.maxLength', { max }));

/** Optional text. `''` is valid here and dropped by `stripEmpty()` on submit. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, vmsg('validation.maxLength', { max }))
    .optional();

export const optionalEmail = () =>
  z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || z.string().email().safeParse(value).success, {
      message: vmsg('validation.invalidEmail'),
    });

/**
 * Lao numbers are written with spaces, dashes and an optional +856 prefix. The
 * API only checks that it is a plausible phone string, so this stays permissive
 * and catches the obvious mistakes.
 */
const PHONE_PATTERN = /^[+]?[\d\s-]{6,20}$/;

export const requiredPhone = () =>
  z
    .string({ required_error: vmsg('validation.required') })
    .trim()
    .min(1, vmsg('validation.required'))
    .regex(PHONE_PATTERN, vmsg('validation.invalidPhone'));

export const optionalPhone = () =>
  z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || PHONE_PATTERN.test(value), {
      message: vmsg('validation.invalidPhone'),
    });

const OBJECT_ID = /^[a-f\d]{24}$/i;

/** 24-character hex ObjectId. */
export const requiredId = () =>
  z
    .string({ required_error: vmsg('validation.required') })
    .regex(OBJECT_ID, vmsg('validation.required'));

export const optionalId = () =>
  z
    .string()
    .optional()
    .refine((value) => !value || OBJECT_ID.test(value), { message: vmsg('validation.required') });

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** `yyyy-MM-dd`, as produced by a native date input and expected by the API. */
export const requiredDate = () =>
  z
    .string({ required_error: vmsg('validation.required') })
    .min(1, vmsg('validation.required'))
    .regex(DATE_ONLY, vmsg('validation.invalidDate'));

export const optionalDate = () =>
  z
    .string()
    .optional()
    .refine((value) => !value || DATE_ONLY.test(value), {
      message: vmsg('validation.invalidDate'),
    });

export const requiredNumber = (options: { min?: number; max?: number; integer?: boolean } = {}) => {
  let schema = z.number({
    required_error: vmsg('validation.required'),
    invalid_type_error: vmsg('validation.required'),
  });
  if (options.integer) schema = schema.int(vmsg('validation.integer'));
  if (options.min !== undefined)
    schema = schema.min(options.min, vmsg('validation.min', { min: options.min }));
  if (options.max !== undefined)
    schema = schema.max(options.max, vmsg('validation.max', { max: options.max }));
  return schema;
};

export const optionalNumber = (options: { min?: number; max?: number } = {}) =>
  requiredNumber(options).optional();

/**
 * Cross-field date check for every start/end pair (school year, semester,
 * calendar event). ISO `yyyy-MM-dd` strings compare correctly as strings.
 */
export function endAfterStart(values: { startDate?: string; endDate?: string }): boolean {
  if (!values.startDate || !values.endDate) return true;
  return values.endDate >= values.startDate;
}

export const endAfterStartIssue = {
  path: ['endDate'] as [string],
  message: vmsg('validation.endBeforeStart'),
};
