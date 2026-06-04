import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { admin, captcha } from 'better-auth/plugins';
import { createElement } from 'react';
import { db } from '@/db';
import { env } from '@/env';
import { sendEmail } from '@/lib/email/send';
import { VerifyEmail } from '@/lib/email/templates/verify-email';
import { ResetPasswordEmail } from '@/lib/email/templates/reset-password';
import { logger } from '@/lib/logger';
import { isDisposableEmail } from '@/lib/email/disposable';
import { DISPOSABLE_EMAIL_MESSAGE } from '@/lib/auth-messages';

// Surface "is Google sign-in available?" to server components without
// requiring a NEXT_PUBLIC_ env var. The auth pages read this and pass
// it into the client forms; when false, the button is not rendered.
export const googleAuthEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);

// Register the Google provider only when both halves of the credential
// are present. The narrowing inside the condition keeps TS happy without
// non-null assertions.
const socialProviders =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
        },
      }
    : undefined;

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  // Cloudflare Turnstile captcha plugin (ticket #25). Server-side verifies
  // the x-captcha-response header against Cloudflare siteverify on the
  // three bot-exposed endpoints: /sign-up/email, /sign-in/email,
  // /request-password-reset. Token-based /reset-password is already
  // bot-resistant (single-use token) and is intentionally not guarded.
  plugins: [
    captcha({
      provider: 'cloudflare-turnstile',
      secretKey: env.TURNSTILE_SECRET_KEY,
    }),
    // Admin plugin (ticket #26). Authorizes off user.role: new users default to
    // 'user', and 'admin' is the privileged role. Provides banUser/unbanUser
    // (= suspend/ban), setRole (= promote/demote), at-sign-in ban blocking, and
    // session revocation on ban. Impersonation is deferred (Decision 7) — the
    // endpoint exists but no UI is built in #26.
    admin({
      defaultRole: 'user',
      adminRoles: ['admin'],
    }),
  ],
  // Rate limiting using Better Auth's built-in throttle rules. No
  // customRules — the built-in /sign-in/* and /sign-up/* rule (3 per 10s)
  // plus reset/verify (3 per 60s) already satisfies AC2.
  rateLimit: {
    // enabled explicitly (default is prod-only) so dev exercises the throttle
    enabled: true,
    storage: 'database', // persisted in the rate_limit table (survives restarts)
  },
  // Behind Cloudflare + Caddy, the socket peer is the proxy. Read the real
  // visitor IP from X-Real-IP (Caddy sets it to the trusted Cf-Connecting-Ip
  // value) so session.ip_address records the client, not the edge.
  advanced: {
    ipAddress: {
      ipAddressHeaders: ['x-real-ip'],
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 3600, // 1h — Better Auth default; explicit for clarity
    // Revokes all other sessions after a successful reset — the reset email's
    // "signs you out of all other devices" note depends on this being true.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }, request) => {
      // Skip internal/programmatic calls (request === undefined) — guards
      // against server-side auth.api calls dispatching real mail. Logged so
      // it stays observable.
      if (!request) {
        logger.info(
          { event: 'email.reset.skipped_internal_call', userId: user.id },
          'Skipped reset email for internal (non-HTTP) call',
        );
        return;
      }
      const result = await sendEmail({
        to: user.email,
        subject: 'Reset your Balikha password',
        react: createElement(ResetPasswordEmail, { resetUrl: url }),
      });
      if (!result.ok) {
        // Better Auth swallows this throw; the structured logger.error is
        // the real observability hook for alerting on send failures.
        logger.error(
          { event: 'email.reset.send_failed', userId: user.id, errMessage: result.error },
          'Failed to send password-reset email',
        );
        throw new Error(`sendResetPassword failed: ${result.error}`);
      }
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    expiresIn: 86400, // 24h — longer than Better Auth's 1h default; verification is idempotent so replay is harmless
    sendVerificationEmail: async ({ user, url }, request) => {
      // Skip internal/programmatic calls (request === undefined). The seed
      // creates many users via auth.api.signUpEmail() — without this guard
      // each would dispatch a real email. HTTP signups always have a request.
      // Logged so it stays observable.
      if (!request) {
        logger.info(
          { event: 'email.verification.skipped_internal_call', userId: user.id },
          'Skipped verification email for internal (non-HTTP) call',
        );
        return;
      }
      const result = await sendEmail({
        to: user.email,
        subject: 'Verify your email — Balikha',
        react: createElement(VerifyEmail, { verifyUrl: url }),
      });
      if (!result.ok) {
        // Same swallow caveat as sendResetPassword above.
        logger.error(
          { event: 'email.verification.send_failed', userId: user.id, errMessage: result.error },
          'Failed to send verification email',
        );
        throw new Error(`sendVerificationEmail failed: ${result.error}`);
      }
    },
  },
  socialProviders,
  account: {
    // Encrypt access_token and refresh_token at rest (AES-256-GCM). Pre-launch
    // is the cheapest time to enable — no existing OAuth rows to migrate.
    // Note: despite the flag's name, Better Auth 1.6.9 does NOT encrypt
    // id_token (see better-auth/dist/api/routes/callback.mjs:114 — idToken is
    // stored as-is without setTokenUtil). Defensible upstream: id_token is
    // short-lived (1h), already signed by Google, and less sensitive than a
    // long-lived refresh_token. When auditing the account table, expect
    // id_token to look like a plaintext JWT (eyJ...xxx.yyy.zzz).
    encryptOAuthTokens: true,
    accountLinking: {
      // Auto-link a Google sign-in to an existing email/password user
      // ONLY when the matching email comes from a provider in this list.
      // Restrict to Google for now (Google verifies email at the token
      // level). Adding an UNVERIFIED provider to this list is an
      // account-takeover vector — review carefully before extending.
      trustedProviders: ['google'],
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, _ctx) => {
          if (isDisposableEmail(user.email)) {
            // Must throw APIError, NOT a plain Error — Better Auth re-throws
            // only APIError instances; any other throw is replaced with a
            // generic "Failed to create user" that hides our message.
            throw new APIError('BAD_REQUEST', {
              message: DISPOSABLE_EMAIL_MESSAGE,
              code: 'DISPOSABLE_EMAIL',
            });
          }
          return { data: user };
        },
      },
    },
  },
  // In production only the canonical origin passes Better Auth's CSRF
  // Origin check; dev keeps the three local origins. BETTER_AUTH_URL is
  // https://balikha.art in prod (see /etc/balikha/production.env).
  trustedOrigins:
    env.NODE_ENV === 'production'
      ? [env.BETTER_AUTH_URL]
      : ['https://dev.balikha.art:8443', 'https://balikha.localhost:8443', 'http://localhost:3000'],
});

export type Session = typeof auth.$Infer.Session;
