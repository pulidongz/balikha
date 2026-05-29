import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { createElement } from 'react';
import { db } from '@/db';
import { env } from '@/env';
import { sendEmail } from '@/lib/email/send';
import { VerifyEmail } from '@/lib/email/templates/verify-email';
import { ResetPasswordEmail } from '@/lib/email/templates/reset-password';
import { logger } from '@/lib/logger';
import { isDisposableEmail } from '@/lib/email/disposable';

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
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
    resetPasswordTokenExpiresIn: 3600, // 1h — Better Auth default; explicit for clarity
    // Verified present in Better Auth 1.6.9 (Issue 10): typed at
    // @better-auth/core .../init-options.d.mts:622, consumed at
    // password.mjs:164 (deleteSessions(userId)). The reset email's
    // "signs you out of all other devices" note depends on this.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }, request) => {
      // Skip internal/programmatic calls (request === undefined). No seed
      // path triggers a reset today, but the guard keeps the two send
      // callbacks symmetric and prevents any future server-side
      // auth.api.requestPasswordReset from silently dispatching mail.
      // Logged (not silent) so it stays observable. (Round-2 Issue 6)
      if (!request) {
        logger.info(
          { event: 'email.reset.skipped_internal_call', userId: user.id },
          'Skipped reset email for internal (non-HTTP) call',
        );
        return;
      }
      // createElement avoids needing a .tsx extension on this config —
      // the React tree is constructed in-place and immediately passed to
      // renderEmail inside sendEmail().
      const result = await sendEmail({
        to: user.email,
        subject: 'Reset your Balikha password',
        react: createElement(ResetPasswordEmail, { resetUrl: url }),
      });
      if (!result.ok) {
        // Better Auth's runInBackgroundOrAwait swallows this throw (see
        // node_modules/better-auth/dist/context/create-context.mjs:211-221).
        // Throwing anyway is harmless and the structured event below is
        // our observability hook — future Sentry/error-tracker (item 8A)
        // will alert on this event name.
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
      // Skip internal/programmatic creation (request === undefined). The
      // seed creates ~15+ users via auth.api.signUpEmail(), which would
      // otherwise fire one verification email each (log spam in dev; real
      // sends if ever run with prod creds). Internal auth.api calls pass
      // no request (to-auth-endpoints.mjs:56-67); HTTP signups always do.
      // Logged (not silent) so it stays observable. (Round-2 Issue 6)
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
        // Same swallow caveat as sendResetPassword above. The structured
        // event is the observability hook; the throw is symbolic.
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
        // Signature is (user, context) — context is GenericEndpointContext | null.
        // We don't need context here, so the underscore prefix signals
        // "param exists but intentionally unused" for future contributors.
        before: async (user, _ctx) => {
          if (isDisposableEmail(user.email)) {
            // ★ Round-2 (Issue 1): throw APIError, NOT a plain Error.
            // The sign-up handler (sign-up.mjs:217-231) re-throws ONLY
            // APIError instances and replaces every other throw with a
            // generic FAILED_TO_CREATE_USER ("Failed to create user") —
            // a plain Error would hide our message and break AC4's
            // clear-message contract. APIError surfaces `message` to the
            // sign-up form's existing role="alert" render. For Google
            // OAuth the user is bounced through consent first; a throw
            // here lands them on the existing errorCallbackURL
            // ('/sign-in?error=oauth') with a generic message (acceptable
            // for v1 — disposable Google addresses are rare).
            throw new APIError('BAD_REQUEST', {
              message:
                'Please use a permanent email address. Disposable email providers are not allowed.',
              code: 'DISPOSABLE_EMAIL',
            });
          }
          return { data: user };
        },
      },
    },
  },
  // All three local-dev origins need to pass Better Auth's CSRF Origin check:
  //   - https://dev.balikha.art:8443    — pretty URL (works with Google OAuth)
  //   - https://balikha.localhost:8443  — Caddy with .localhost (no Google OAuth)
  //   - http://localhost:3000           — direct, bypasses Caddy (works with Google OAuth)
  // The middle entry can come off once everyone uses the pretty URL day-to-day.
  trustedOrigins: [
    'https://dev.balikha.art:8443',
    'https://balikha.localhost:8443',
    'http://localhost:3000',
  ],
});

export type Session = typeof auth.$Infer.Session;
