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
import { ChangeEmail } from '@/lib/email/templates/change-email';
import { logger } from '@/lib/logger';
import { isDisposableEmail } from '@/lib/email/disposable';
import { DISPOSABLE_EMAIL_MESSAGE } from '@/lib/auth-messages';
import { mapGoogleProfileToNames, type GoogleNameProfile } from '@/lib/auth-google';

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
          // Better Auth's built-in Google provider passes the decoded ID token
          // (full OIDC claims) here and spreads the result over the user record.
          // We populate the structured first/last fields; `name` stays Google's
          // display name (NOT recomposed from first+last — Google's display name
          // is the better display value). given_name/family_name →
          // firstName/lastName, null surname for mononym accounts.
          // The `profile` param needs an explicit type: the conditional
          // socialProviders object literal isn't contextually typed against the
          // provider options, so a bare param infers as `any` (noImplicitAny).
          // GoogleNameProfile is the structural subset we actually read.
          mapProfileToUser: (profile: GoogleNameProfile) => mapGoogleProfileToNames(profile),
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
  user: {
    // Account email changes (#profile). When the current email is verified
    // (true for Google accounts and verified email/password users), Better Auth
    // sends a confirmation link to the CURRENT address; clicking it applies the
    // change. This anti-hijack flow means a stolen session can't silently move
    // the email — the real owner must click a link in their existing inbox.
    changeEmail: {
      enabled: true,
      sendChangeEmailConfirmation: async ({ user, newEmail, url }, request) => {
        // Skip internal/programmatic calls (request === undefined) — same guard
        // as sendResetPassword / sendVerificationEmail. Logged so it stays
        // observable.
        if (!request) {
          logger.info(
            { event: 'email.change.skipped_internal_call', userId: user.id },
            'Skipped email-change confirmation for internal (non-HTTP) call',
          );
          return;
        }
        // Deliberately sent to user.email (the CURRENT address), NOT newEmail —
        // the confirmation must reach the existing owner, not the requested new
        // address. Better Auth passes the current user here.
        const result = await sendEmail({
          to: user.email,
          subject: 'Confirm your email change — Balikha',
          react: createElement(ChangeEmail, { newEmail, confirmUrl: url }),
        });
        if (!result.ok) {
          // Same swallow caveat as sendResetPassword above — the structured
          // logger.error is the real observability hook.
          logger.error(
            { event: 'email.change.send_failed', userId: user.id, errMessage: result.error },
            'Failed to send email-change confirmation',
          );
          throw new Error(`sendChangeEmailConfirmation failed: ${result.error}`);
        }
      },
    },
    additionalFields: {
      // input:true → accepted from the email/password sign-up call and from
      // Google's mapProfileToUser. required:false so programmatic paths (seed)
      // and OAuth aren't rejected; the form enforces both for the UI path.
      firstName: { type: 'string', required: false, input: true },
      lastName: { type: 'string', required: false, input: true },
      // input:false → server-controlled only; stamped by the create hook below.
      acceptedTermsAt: { type: 'date', required: false, input: false },
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
          // Server-side floor: Better Auth requires a non-empty `name`, and a
          // scripted POST could send blank first/last (additionalFields are
          // required:false). Raise (as APIError, which Better Auth re-throws)
          // rather than persist a junk display name.
          if (!user.name?.trim()) {
            throw new APIError('BAD_REQUEST', {
              message: 'A name is required.',
              code: 'NAME_REQUIRED',
            });
          }
          // `acceptedTermsAt` is stamped at creation for ALL paths. This is a
          // DELIBERATE "acceptance is implied at account creation" record — NOT
          // a per-request consent gate. The email/password form requires the
          // Terms checkbox and Google shows an inline notice, but the seed and
          // any programmatic caller are stamped too. We do NOT recompose `name`
          // here: for Google, `name` stays the display-name claim while
          // firstName/lastName come from given/family (they may legitimately
          // differ).
          return { data: { ...user, acceptedTermsAt: new Date() } };
        },
      },
      update: {
        before: async (data) => {
          // Server-side floor for the email-change path. changeEmail applies the
          // new address through updateUserByEmail, which runs this hook, so a
          // disposable address is blocked even for a scripted POST straight to
          // /change-email that skips changeEmailAction. `email` is only present
          // when the email is actually changing; other updates pass through.
          if (typeof data.email === 'string' && isDisposableEmail(data.email)) {
            throw new APIError('BAD_REQUEST', {
              message: DISPOSABLE_EMAIL_MESSAGE,
              code: 'DISPOSABLE_EMAIL',
            });
          }
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
