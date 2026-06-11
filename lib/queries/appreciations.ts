import { and, count, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { appreciations } from '@/db/schema';

/** Appreciation counts for a batch of products, one GROUP BY query.
 *  Products with zero appreciations are simply absent from the map. */
export async function getAppreciationCounts(productIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (productIds.length === 0) return counts;
  const rows = await db
    .select({ productId: appreciations.productId, value: count() })
    .from(appreciations)
    .where(inArray(appreciations.productId, productIds))
    .groupBy(appreciations.productId);
  for (const r of rows) counts.set(r.productId, r.value);
  return counts;
}

/** Whether `userId` has appreciated `productId`. Cheap PK lookup. */
export async function hasAppreciated(userId: string | null, productId: string): Promise<boolean> {
  if (!userId) return false;
  const [row] = await db
    .select({ userId: appreciations.userId })
    .from(appreciations)
    .where(and(eq(appreciations.userId, userId), eq(appreciations.productId, productId)))
    .limit(1);
  return Boolean(row);
}
