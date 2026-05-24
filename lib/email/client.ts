import { Resend } from 'resend';
import { env } from '@/env';

// Single shared Resend client. Null when the API key is absent — sendEmail
// checks this and falls back to dev-mode rendering. Mirrors the env-gating
// pattern from lib/storage/client.ts (which works for MinIO/R2) and from
// lib/auth.ts's Google socialProviders config (env-gated provider).
export const resend: Resend | null = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
