'use server';

import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { recentlyViewed } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { logAnalyticsEvent } from '@/lib/analytics/log';

const recordSchema = z.object({
  productId: z.string().uuid(),
});

const RECENT_VIEW_CAP = 50;

// Fire-and-forget tracker called from the product detail page server
// component. Anonymous viewers are not tracked. Errors are swallowed —
// "viewed this once" is a nicety, never a reason to break the product
// page. (The plan §8 calls this out explicitly.)
//
// Per buyer plan §11 conventions: recently-viewed is BUYER-PRIVATE.
// Sellers must not be able to see who viewed their product. No query
// in this codebase joins recentlyViewed back to user identity for any
// seller-facing surface.
export async function recordRecentlyViewedAction(input: unknown): Promise<void> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return;

  const current = await getCurrentUser();
  if (!current) return;

  try {
    // Upsert on the composite PK (userId, productId): first view inserts,
    // subsequent views bump lastViewedAt. The PK is what makes this
    // single-row instead of "select-then-decide".
    await db
      .insert(recentlyViewed)
      .values({ userId: current.id, productId: parsed.data.productId })
      .onConflictDoUpdate({
        target: [recentlyViewed.userId, recentlyViewed.productId],
        set: { lastViewedAt: new Date() },
      });

    // Eviction sweep — keep the most-recent N rows for this user, drop
    // anything older. Best-effort; if it fails, the table just grows
    // slightly above the cap until the next view triggers another sweep.
    await db.execute(sql`
      DELETE FROM recently_viewed
      WHERE user_id = ${current.id}
      AND product_id NOT IN (
        SELECT product_id FROM recently_viewed
        WHERE user_id = ${current.id}
        ORDER BY last_viewed_at DESC
        LIMIT ${RECENT_VIEW_CAP}
      )
    `);
  } catch (e) {
    logger.error({ err: e, userId: current.id }, 'recordRecentlyViewed failed');
    // Intentionally swallow — never break the product page render.
  }

  // Funnel telemetry: product_viewed (authenticated viewers only —
  // anonymous viewers returned early above). Separate best-effort call;
  // the helper owns its try/catch so it cannot break the page render.
  // artisanProfileId is left null here (the action only receives a
  // productId); per-artisan view rollups can JOIN products on entity_id.
  await logAnalyticsEvent({
    type: 'product_viewed',
    userId: current.id,
    entityType: 'product',
    entityId: parsed.data.productId,
  });
}
