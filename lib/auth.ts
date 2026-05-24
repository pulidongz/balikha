import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/db';
import { env } from '@/env';

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
  // Both the canonical https://balikha.localhost:8443 (via Caddy) and the
  // direct http://localhost:3000 (bypass Caddy) need to pass Better Auth's
  // CSRF Origin check during local dev. The plain-localhost entry can come
  // off once everyone uses the Caddy URL day-to-day.
  trustedOrigins: ['https://balikha.localhost:8443', 'http://localhost:3000'],
});

export type Session = typeof auth.$Infer.Session;
