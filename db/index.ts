import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '@/env';

// Explicit pool sizing (E7). postgres-js defaults to max:10 with no
// connect timeout; we pin all three deliberately for the single 1GB Linode
// (prod) and to stay friendly to local dev, where several dev servers each
// open a pool against the same Postgres (max_connections=100) and saturate
// it. max:10 caps each instance's footprint (10 app conns leaves ample
// headroom for migrations, psql, and the seed on the 100-conn server);
// idle_timeout returns idle conns quickly so concurrent dev servers don't
// pile up; connect_timeout fails fast instead of hanging on a saturated or
// unreachable DB. All three are in SECONDS.
const client = postgres(env.DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

/**
 * Drizzle database client.
 *
 * Use `db` for queries and single-write mutations (one INSERT/UPDATE/DELETE
 * is already atomic by Postgres).
 *
 * For multi-write mutations — anything that does two or more writes that
 * must succeed together — wrap the work in a transaction:
 *
 *     await db.transaction(async (tx) => {
 *       const [parent] = await tx.insert(parents).values({...}).returning();
 *       await tx.insert(children).values({ parentId: parent.id, ... });
 *     });
 *
 * Critical: every write inside the callback must use `tx`, NEVER `db`.
 * Mixing the two is silent — the `db` write commits independently and
 * defeats the rollback guarantee. Code review enforces this rule.
 *
 * Throwing inside the callback rolls back the transaction. Combine with the
 * Result pattern (lib/result.ts) by catching at the action boundary:
 *
 *     try {
 *       const out = await db.transaction(async (tx) => { ... });
 *       return ok(out);
 *     } catch (e) {
 *       logger.error({ err: e }, 'action failed');
 *       return err('Could not complete request');
 *     }
 */
export const db = drizzle(client, { schema });

/**
 * The transaction handle passed to db.transaction's callback. Useful when
 * a helper wants to participate in an existing transaction — e.g.
 * lib/actions/orders.ts:transitionOrder accepts an `onTransition(tx, ...)`
 * callback so callers can run additional writes (stock returns, dispute
 * row inserts, etc.) inside the same atomic boundary as the status flip.
 */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
