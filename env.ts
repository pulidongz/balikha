import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url(),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
    // S3-compatible object storage. MinIO in dev, Cloudflare R2 in prod —
    // same client, only the values differ.
    S3_ENDPOINT: z.string().url(),
    S3_REGION: z.string().default('auto'),
    S3_ACCESS_KEY_ID: z.string().min(1),
    S3_SECRET_ACCESS_KEY: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    // MUST point at the isolated storage/CDN origin in production —
    // `images.balikha.art` (a Cloudflare-fronted R2 custom domain), which is
    // a DIFFERENT origin from the application. There is no app-hosted image
    // proxy; uploaded images are served directly from this origin. If this
    // value is ever set to the app origin, AC3 (isolated serving origin) is
    // violated and uploaded images would be served from the application server.
    S3_PUBLIC_URL_BASE: z.string().url(),
    // Order lifecycle timeouts. Hours for seller-response (short window,
    // tunable to local commerce rhythm); days for buyer-auto-confirm
    // (long enough that "package arrived later than expected" usually
    // resolves before the timeout fires). The buyer-facing UI on shipped
    // orders surfaces the same value so buyers know their dispute deadline.
    ORDER_SELLER_RESPONSE_TIMEOUT_HOURS: z.coerce.number().int().positive().default(48),
    ORDER_BUYER_AUTO_CONFIRM_DAYS: z.coerce.number().int().positive().default(14),
    // Messaging rate limits. Defaults tuned for an early-stage
    // marketplace ("calm confidence" — sellers should not be drowning
    // in messages, see PRODUCT.md). Tune post-deploy via env without
    // a code change.
    //
    // The new-thread limit is per-buyer TOTAL across all artisans —
    // a buyer who has started this many new pre-purchase threads in
    // the last 24h cannot open another, regardless of which artisan.
    // The name says PER_BUYER (not PER_ARTISAN) so the semantics are
    // unambiguous when tuning.
    MESSAGING_NEW_THREADS_PER_BUYER_PER_24H: z.coerce.number().int().positive().default(1),
    MESSAGING_MAX_MESSAGES_PER_USER_PER_DAY: z.coerce.number().int().positive().default(50),
    MESSAGING_MAX_MESSAGES_PER_THREAD_PER_MINUTE: z.coerce.number().int().positive().default(3),
    // Google OAuth credentials. Optional — when both are absent the dev
    // server still boots and email/password sign-in works unchanged.
    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
    // Resend transactional email. RESEND_API_KEY is optional so the dev
    // server boots without it (sendEmail() falls back to render-and-log).
    // EMAIL_FROM and EMAIL_REPLY_TO are required with no default —
    // identity-load-bearing values where a silent default would mask a
    // misconfigured prod deploy.
    RESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().email(),
    EMAIL_REPLY_TO: z.string().email(),
    // Cloudflare Turnstile bot challenge (ticket #25).
    // Required with no default — a prod deploy missing this key fails at
    // boot (fail-loud), and the server-side captcha plugin cannot verify
    // challenge tokens without it.
    TURNSTILE_SECRET_KEY: z.string().min(1),
    // Static-admin bootstrap (ticket #26). Optional with no default — the
    // `admin:bootstrap` script enforces their presence at *runtime* (throws
    // if unset when invoked). They MUST stay optional: a required var would
    // fail `next build` env validation in CI/release (the #25 lesson), and
    // the CI/release build env: blocks deliberately don't carry these.
    ADMIN_EMAIL: z.string().email().optional(),
    ADMIN_PASSWORD: z.string().min(8).optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url(),
    // Cloudflare Turnstile site key. NEXT_PUBLIC_ prefix inlines it at
    // compile time so the client widget can read it without an API call.
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1),
  },
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    NODE_ENV: process.env.NODE_ENV,
    LOG_LEVEL: process.env.LOG_LEVEL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_REGION: process.env.S3_REGION,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_PUBLIC_URL_BASE: process.env.S3_PUBLIC_URL_BASE,
    ORDER_SELLER_RESPONSE_TIMEOUT_HOURS: process.env.ORDER_SELLER_RESPONSE_TIMEOUT_HOURS,
    ORDER_BUYER_AUTO_CONFIRM_DAYS: process.env.ORDER_BUYER_AUTO_CONFIRM_DAYS,
    MESSAGING_NEW_THREADS_PER_BUYER_PER_24H: process.env.MESSAGING_NEW_THREADS_PER_BUYER_PER_24H,
    MESSAGING_MAX_MESSAGES_PER_USER_PER_DAY: process.env.MESSAGING_MAX_MESSAGES_PER_USER_PER_DAY,
    MESSAGING_MAX_MESSAGES_PER_THREAD_PER_MINUTE:
      process.env.MESSAGING_MAX_MESSAGES_PER_THREAD_PER_MINUTE,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_REPLY_TO: process.env.EMAIL_REPLY_TO,
    TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY,
    ADMIN_EMAIL: process.env.ADMIN_EMAIL,
    ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  },
  emptyStringAsUndefined: true,
});
