import { z } from 'zod';
import { vmsg } from '@/lib/form-message';

/**
 * The API's password policy, mirrored exactly:
 * at least 8 characters, with a lowercase letter, an uppercase letter and a digit.
 * Duplicating it here only fails fast — the server re-checks every time.
 *
 * Messages are i18n keys, translated at render time (see `lib/form-message`).
 */
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/;

const password = () =>
  z
    .string()
    .min(8, vmsg('auth.passwordRule'))
    .max(128, vmsg('validation.maxLength', { max: 128 }))
    .regex(PASSWORD_PATTERN, vmsg('auth.passwordRule'));

export const loginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1, vmsg('validation.required'))
    .max(50, vmsg('validation.maxLength', { max: 50 })),
  password: z.string().min(1, vmsg('validation.required')).max(128),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  username: z.string().trim().min(1, vmsg('validation.required')),
});
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(1, vmsg('validation.required')),
    newPassword: password(),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: vmsg('auth.passwordMismatch'),
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, vmsg('validation.required')),
    newPassword: password(),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: vmsg('auth.passwordMismatch'),
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
