import { Resend } from 'resend';
import { env } from '@/env';

// Single shared Resend client. Null when the API key is absent — sendEmail
// checks this and falls back to dev-mode rendering. Mirrors the optional-
// provider pattern in lib/auth.ts (env-gated Google socialProviders — set
// only when both client id and secret are present).
export const resend: Resend | null = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
