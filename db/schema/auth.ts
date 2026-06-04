import { pgTable, text, timestamp, boolean, integer, bigint } from 'drizzle-orm/pg-core';

// Authorization columns (`role`, `banned`, `ban_reason`, `ban_expires`) are
// the Better Auth admin plugin's expected schema (ticket #26). They are
// hand-edited here — do NOT regenerate this file via Better Auth's CLI, which
// would strip these (and any other) columns it doesn't model identically.
// `role`/`banned` are kept NOT NULL DEFAULT (stricter than the plugin's
// optional fields, matching the prior `is_admin` convention); the plugin's
// role-injecting hook populates `role` on every sign-up path.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  role: text('role').notNull().default('user'),
  banned: boolean('banned').notNull().default(false),
  banReason: text('ban_reason'),
  banExpires: timestamp('ban_expires'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  // Admin plugin's expected column. We don't build an impersonation UI in #26
  // (Decision 7), but the plugin's schema includes it; kept nullable.
  impersonatedBy: text('impersonated_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Better Auth built-in rate limiting — database storage (ticket #25).
// Export name MUST be `rateLimit` (camelCase): the Drizzle adapter resolves
// this via schema['rateLimit'] and throws BetterAuthError if the name differs.
// key is NOT NULL UNIQUE — duplicate keys corrupt counts (Issue 2).
// lastRequest uses mode:'number' so Better Auth can do arithmetic without
// BigInt/number type mismatch errors (Issue 3).
export const rateLimit = pgTable('rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(), // unique+required — dupes corrupt counts
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(), // mode:'number', not bigint
});
