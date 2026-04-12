import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/server/db';
import { env } from '@/server/config/env';
import * as schema from '@/server/db/schema';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg', schema }),

  secret: env.AUTH_SECRET,
  baseURL: env.APP_URL,

  emailAndPassword: {
    enabled: true,
    // Email verification requires a transport, deferred to
    // feature/email-verification. Users sign up and are immediately active.
    requireEmailVerification: false,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },

  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'buyer',
        // CRITICAL SECURITY: input: false prevents users from self-assigning
        // admin/seller via the signup payload. Two Vitest tests guard this —
        // do NOT remove either the flag or the tests.
        input: false,
      },
      avatarUrl: {
        type: 'string',
        required: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // rolling refresh if session > 1 day old
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  advanced: {
    cookiePrefix: 'balikha',
    useSecureCookies: env.APP_URL.startsWith('https'),
    defaultCookieAttributes: {
      sameSite: 'lax',
      httpOnly: true,
      path: '/',
    },
  },
});
