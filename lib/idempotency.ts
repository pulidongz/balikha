import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { idempotencyKeys } from '@/db/schema';
import { logger } from '@/lib/logger';
import { err, type Result } from '@/lib/result';
import {
  IDEMPOTENCY_SCOPE_MISMATCH_MESSAGE,
  IDEMPOTENCY_TTL_MS,
  IDEMPOTENCY_USER_MISMATCH_MESSAGE,
} from './idempotency-in-tx';

// Re-export the in-tx idempotency API so `@/lib/idempotency` remains the
// single public surface (the helper lives in an env-free sibling module so
// it can be unit-tested in CI without loading @/db / @/env).
export { IDEMPOTENCY_TTL_MS, withInTxIdempotency } from './idempotency-in-tx';
export type { InTxIdempotencyOutcome } from './idempotency-in-tx';

interface IdempotencyOptions<T> {
  /** Caller-supplied UUID. If absent or empty, fn() runs without dedup. */
  key: string | null | undefined;
  /** Action discriminator — same key reused across actions doesn't collide. */
  scope: string;
  /** Optional user ID. Same key from a different user is rejected. */
  userId?: string | null;
  /** The actual work. Must return a Result. */
  fn: () => Promise<Result<T>>;
}

/**
 * Wrap a server action's body so retries with the same idempotencyKey
 * return the cached response instead of re-running. Stripe-style.
 *
 * Trade-offs worth knowing about:
 * - The cache stores BOTH success and failure responses. Two attempts
 *   with the same key always see the same outcome — so a transient
 *   failure does not get retried "fresh" with the cached key. Use a new
 *   key for "I want to actually try again."
 * - The race window between "cache check" and "insert into cache" allows
 *   fn() to run twice on rapid concurrent retries. onConflictDoNothing
 *   prevents the duplicate cache row, but both fn() invocations have
 *   already touched the DB. For payments-grade hard idempotency, layer
 *   a Postgres advisory lock on top — see plan §8.
 * - Cleanup of expired rows is a separate periodic job (deferred per
 *   plan §8); the expires_at index supports it.
 */
export async function withIdempotency<T>(opts: IdempotencyOptions<T>): Promise<Result<T>> {
  const { key, scope, userId, fn } = opts;

  // No key → no idempotency, plain execute.
  if (!key) return fn();

  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(eq(idempotencyKeys.key, key))
    .limit(1);

  if (existing) {
    if (existing.scope !== scope) {
      logger.warn(
        { key, scope, existingScope: existing.scope },
        'Idempotency scope mismatch — rejecting',
      );
      return err(IDEMPOTENCY_SCOPE_MISMATCH_MESSAGE);
    }
    if (userId && existing.userId && existing.userId !== userId) {
      logger.warn({ key, scope }, 'Idempotency user mismatch — rejecting');
      return err(IDEMPOTENCY_USER_MISMATCH_MESSAGE);
    }
    logger.info({ key, scope }, 'Idempotency cache hit');
    return JSON.parse(existing.responseJson) as Result<T>;
  }

  const result = await fn();

  await db
    .insert(idempotencyKeys)
    .values({
      key,
      userId: userId ?? null,
      scope,
      responseJson: JSON.stringify(result),
      expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
    })
    .onConflictDoNothing();

  return result;
}
