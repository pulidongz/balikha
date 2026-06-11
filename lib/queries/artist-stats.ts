import { and, count, eq, gte, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  analyticsEvents,
  appreciations,
  artisanFollows,
  products,
  workComments,
} from '@/db/schema';

export interface ArtistStatTotals {
  views: number;
  followers: number;
  appreciations: number;
  comments: number;
}

export interface ArtistStats {
  totals: ArtistStatTotals;
  last30d: ArtistStatTotals;
  /** Views per day over the last 30 days, oldest first. Days with zero
   *  views are present (length is always 30). */
  viewsByDay: Array<{ day: string; views: number }>;
}

// Views = studio_viewed events for this studio + product_viewed events
// for its products (joined on entity_id — product_viewed rows don't carry
// artisanProfileId, per the recently-viewed action's contract). Owner
// self-views are excluded by user id; anonymous rows (user_id NULL) count.
function viewsPredicate(artisanProfileId: string, ownerUserId: string, productIds: string[]) {
  const notOwner = or(
    sql`${analyticsEvents.userId} IS NULL`,
    ne(analyticsEvents.userId, ownerUserId),
  );
  const studioViews = and(
    eq(analyticsEvents.type, 'studio_viewed'),
    eq(analyticsEvents.artisanProfileId, artisanProfileId),
  );
  const productViews =
    productIds.length > 0
      ? and(
          eq(analyticsEvents.type, 'product_viewed'),
          inArray(analyticsEvents.entityId, productIds),
        )
      : sql`false`;
  return and(or(studioViews, productViews), notOwner);
}

export async function getArtistStats(
  artisanProfileId: string,
  ownerUserId: string,
): Promise<ArtistStats> {
  const cutoff30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const productRows = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.artisanProfileId, artisanProfileId));
  const productIds = productRows.map((p) => p.id);

  const views = viewsPredicate(artisanProfileId, ownerUserId, productIds);

  async function countWhere(
    table: 'views' | 'followers' | 'appreciations' | 'comments',
    since?: Date,
  ) {
    if (table === 'views') {
      const [row] = await db
        .select({ value: count() })
        .from(analyticsEvents)
        .where(since ? and(views, gte(analyticsEvents.createdAt, since)) : views);
      return row?.value ?? 0;
    }
    if (table === 'followers') {
      const base = eq(artisanFollows.artisanProfileId, artisanProfileId);
      const [row] = await db
        .select({ value: count() })
        .from(artisanFollows)
        .where(since ? and(base, gte(artisanFollows.createdAt, since)) : base);
      return row?.value ?? 0;
    }
    if (table === 'appreciations') {
      const base = eq(products.artisanProfileId, artisanProfileId);
      const [row] = await db
        .select({ value: count() })
        .from(appreciations)
        .innerJoin(products, eq(products.id, appreciations.productId))
        .where(since ? and(base, gte(appreciations.createdAt, since)) : base);
      return row?.value ?? 0;
    }
    const base = and(
      eq(products.artisanProfileId, artisanProfileId),
      ne(workComments.userId, ownerUserId),
    );
    const [row] = await db
      .select({ value: count() })
      .from(workComments)
      .innerJoin(products, eq(products.id, workComments.productId))
      .where(since ? and(base, gte(workComments.createdAt, since)) : base);
    return row?.value ?? 0;
  }

  const [totals, last30d] = await Promise.all([
    Promise.all([
      countWhere('views'),
      countWhere('followers'),
      countWhere('appreciations'),
      countWhere('comments'),
    ]).then(([v, f, a, c]) => ({ views: v, followers: f, appreciations: a, comments: c })),
    Promise.all([
      countWhere('views', cutoff30d),
      countWhere('followers', cutoff30d),
      countWhere('appreciations', cutoff30d),
      countWhere('comments', cutoff30d),
    ]).then(([v, f, a, c]) => ({ views: v, followers: f, appreciations: a, comments: c })),
  ]);

  // Daily view counts, zero-filled to a fixed 30-day series so the chart
  // never has holes.
  const dayRows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${analyticsEvents.createdAt}), 'YYYY-MM-DD')`,
      value: count(),
    })
    .from(analyticsEvents)
    .where(and(views, gte(analyticsEvents.createdAt, cutoff30d)))
    .groupBy(sql`date_trunc('day', ${analyticsEvents.createdAt})`);
  const byDay = new Map(dayRows.map((r) => [r.day, r.value]));

  const viewsByDay: Array<{ day: string; views: number }> = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    viewsByDay.push({ day: key, views: byDay.get(key) ?? 0 });
  }

  return { totals, last30d, viewsByDay };
}
