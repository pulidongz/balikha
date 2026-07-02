import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { recentlyViewed } from '@/db/schema';
import { logger } from '@/lib/logger';
import { logAnalyticsEvent } from '@/lib/analytics/log';

const RECENT_VIEW_CAP = 50;

// Records a signed-in viewer's product view. NOT a `'use server'` action and it
// takes the already-resolved userId rather than calling getCurrentUser() —
// because the only caller invokes it from a Server Component inside `after()`,
// where Request APIs (headers/cookies, and therefore getCurrentUser) are
// unavailable (Next 16 `after` docs: read request data during render and pass
// the values in). The page resolves the viewer during render and passes its id.
//
// Best-effort: DB errors are swallowed — "viewed this once" is a nicety, never a
// reason to break the product page. Per buyer plan §11, recently-viewed is
// BUYER-PRIVATE: no seller-facing query joins it back to user identity.
export async function recordRecentlyViewed(userId: string, productId: string): Promise<void> {
  try {
    // Upsert on the composite PK (userId, productId): first view inserts,
    // subsequent views bump lastViewedAt.
    await db
      .insert(recentlyViewed)
      .values({ userId, productId })
      .onConflictDoUpdate({
        target: [recentlyViewed.userId, recentlyViewed.productId],
        set: { lastViewedAt: new Date() },
      });

    // Eviction sweep — keep the most-recent N rows for this user, drop older.
    // Best-effort; if it fails the table grows slightly above the cap until the
    // next view triggers another sweep.
    await db.execute(sql`
      DELETE FROM recently_viewed
      WHERE user_id = ${userId}
      AND product_id NOT IN (
        SELECT product_id FROM recently_viewed
        WHERE user_id = ${userId}
        ORDER BY last_viewed_at DESC
        LIMIT ${RECENT_VIEW_CAP}
      )
    `);
  } catch (e) {
    logger.error({ err: e, userId }, 'recordRecentlyViewed failed');
    // Intentionally swallow — never break the product page render.
  }

  // Funnel telemetry: product_viewed. logAnalyticsEvent owns its own try/catch
  // and reads request_id defensively, so it is safe inside after().
  await logAnalyticsEvent({
    type: 'product_viewed',
    userId,
    entityType: 'product',
    entityId: productId,
  });
}
