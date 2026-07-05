import { eq, sql } from 'drizzle-orm';
import type { Tx } from '@/db';
import { idempotencyKeys } from '@/db/schema';
import { err, type Result } from '@/lib/result';

/**
 * Idempotency cache entry lifetime. Single-sourced here (env-free module)
 * so both the outer withIdempotency wrapper and this in-tx helper share it.
 */
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** Guard messages — byte-identical to the outer withIdempotency's own, so
 * the cache-hit-inside-lock path and the pre-check path return the same copy. */
export const IDEMPOTENCY_SCOPE_MISMATCH_MESSAGE =
  'Idempotency key already used for a different operation.';
export const IDEMPOTENCY_USER_MISMATCH_MESSAGE =
  'Idempotency key already used by a different user.';

export type InTxIdempotencyOutcome<T, E> =
  | { kind: 'cached'; result: Result<T> }
  | { kind: 'fresh'; result: Result<T>; extra: E };

interface InTxIdempotencyOptions<T, E> {
  /** Idempotency key. Null/empty → no lock, no re-check, no cache insert
   * (run() still executes). Preserves placeOrder's optional-key path. */
  key: string | null | undefined;
  /** Action discriminator; a key reused across scopes returns a scope-mismatch error. */
  scope: string;
  /** Actor; a cached row from a different user returns a user-mismatch error. */
  userId?: string | null;
  /**
   * Domain body. Returns the cacheable `result` (a Result<T>, serialized into
   * responseJson) and `extra` (post-commit-only data that must NOT be cached).
   * THROW for non-cacheable/transient failures so the transaction rolls back —
   * do NOT return them as `result`; the helper never catches run()'s throws.
   */
  run: () => Promise<{ result: Result<T>; extra: E }>;
}

/**
 * Payments-grade in-transaction idempotency, run inside the caller's `tx`:
 *  1. pg_advisory_xact_lock(hashtext(key)) — serializes same-key retries for
 *     the life of this transaction.
 *  2. In-lock re-check of idempotency_keys — a retry that already committed
 *     sees the prior row and returns its cached Result instead of re-running.
 *  3. In-tx insert (onConflictDoNothing) — commits atomically with the domain
 *     work while the lock is held, so a concurrent retry's re-check finds it.
 * Callers keep the OUTER withIdempotency() wrapper too: it pre-checks outside
 * the tx and caches business-error Results that roll this transaction back.
 */
export async function withInTxIdempotency<T, E>(
  tx: Tx,
  opts: InTxIdempotencyOptions<T, E>,
): Promise<InTxIdempotencyOutcome<T, E>> {
  const { key, scope, userId, run } = opts;

  if (key) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${key}))`);
    const [cached] = await tx
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
      .limit(1);
    if (cached) {
      if (cached.scope !== scope) {
        return { kind: 'cached', result: err(IDEMPOTENCY_SCOPE_MISMATCH_MESSAGE) };
      }
      if (cached.userId && userId && cached.userId !== userId) {
        return { kind: 'cached', result: err(IDEMPOTENCY_USER_MISMATCH_MESSAGE) };
      }
      return { kind: 'cached', result: JSON.parse(cached.responseJson) as Result<T> };
    }
  }

  const { result, extra } = await run();

  if (key) {
    await tx
      .insert(idempotencyKeys)
      .values({
        key,
        userId: userId ?? null,
        scope,
        responseJson: JSON.stringify(result),
        expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_MS),
      })
      .onConflictDoNothing();
  }

  return { kind: 'fresh', result, extra };
}
