import { z } from 'zod';
import { isDisposableEmail } from '@/lib/email/disposable';

// Better Auth's own bounds are min 8 / max 128 (its password.config defaults).
// We cap at 128 here — NOT the 200 that signUpSchema allows — so the form never
// accepts a length the /change-password and setPassword endpoints would reject.
const passwordField = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be 128 characters or fewer');

// New email for the account-email change. Disposable addresses are rejected for
// parity with sign-up (the create hook blocks them there). The "differs from
// current" check lives in the caller — it needs the session email, which a
// pure schema doesn't have.
export const changeEmailSchema = z.object({
  email: z
    .string()
    .email('Enter a valid email address')
    .max(254)
    .refine((email) => !isDisposableEmail(email), {
      message: 'Please use a permanent email address. Disposable providers are not allowed.',
    }),
});

// Existing-password holders changing their password. currentPassword is only
// required to be non-empty — Better Auth verifies it against the stored hash.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordField,
    confirm: z.string(),
  })
  .refine((data) => data.newPassword === data.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

// Google-only users setting a first password (no currentPassword — they have
// none). Backs setPasswordAction, which re-validates server-side.
export const setPasswordSchema = z
  .object({
    newPassword: passwordField,
    confirm: z.string(),
  })
  .refine((data) => data.newPassword === data.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
