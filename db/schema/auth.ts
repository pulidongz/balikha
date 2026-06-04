import { pgTable, text, timestamp, boolean, integer, bigint } from 'drizzle-orm/pg-core';

// `is_admin` is hand-managed and NOT part of Better Auth's schema. If you ever
// regenerate this file via Better Auth's CLI, re-add it — Better Auth will
// strip columns it doesn't know about. It's safe to leave on the table at
// runtime: Better Auth ignores unknown columns.
export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  isAdmin: boolean('is_admin').notNull().default(false),
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
