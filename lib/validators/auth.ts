import { z } from 'zod';

// Mirrors what better-auth accepts at /api/auth/sign-up/email and
// /api/auth/sign-in/email. Length caps prevent abusive input.
export const signUpSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(40),
  // Optional at the schema level (DB column is nullable for Google mononyms);
  // the signup form additionally requires it for the email/password path.
  lastName: z.string().max(40).optional().default(''),
  email: z.string().email('Enter a valid email address').max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200, 'Password too long'),
  acceptTerms: z.literal(true, {
    error: 'You must accept the Terms to continue',
  }),
});

export const signInSchema = z.object({
  email: z.string().email('Enter a valid email address').max(254),
  password: z.string().min(1, 'Password is required').max(200),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
