import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';
import { env } from '@/env';

const client = postgres(env.DATABASE_URL);

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
