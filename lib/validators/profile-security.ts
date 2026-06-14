import { z } from 'zod';
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '@/lib/auth-constants';

// Bounds come from the shared constants that also drive Better Auth's
// emailAndPassword config (lib/auth.ts), so the form never accepts a length the
// /change-password and setPassword endpoints would reject. (signUpSchema's looser
// max 200 is intentionally separate — these gate the credential-change endpoints.)
const passwordField = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(MAX_PASSWORD_LENGTH, `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer`);

// New email for the account-email change. Shape-only here on purpose:
// disposable-domain rejection and the "differs from current" check are enforced
// server-side (changeEmailAction + databaseHooks.user.update.before in
// lib/auth.ts). Importing isDisposableEmail would pull the ~3500-domain JSON
// into the client bundle, since this schema is used by the 'use client'
// email-change-form (see the header in lib/email/disposable.ts).
export const changeEmailSchema = z.object({
  email: z.string().email('Enter a valid email address').max(254),
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
