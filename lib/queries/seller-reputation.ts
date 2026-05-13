import { unstable_cache } from 'next/cache';
import { sql } from 'drizzle-orm';
import { db } from '@/db';

// Buckets for "Typically responds within X". Edges chosen to match
// human intuition rather than uniform thresholds — buyers care about
// "fast/today/tomorrow/slower than that," not precise ms.
export type ResponseTimeBucket = 'fast' | 'within-day' | 'within-2-days' | 'slow';

export interface SellerReputation {
  totalOrdersInWindow: number;
  /** Median time (in ms) from placedAt to first accept/decline. Null when 0 responded. */
  responseTimeMedianMs: number | null;
  /** Bucketed version of responseTimeMedianMs for display. Null when no median. */
  responseTimeBucket: ResponseTimeBucket | null;
  /** Fraction (0..1) of orders responded to (accepted or declined). */
  responseRate: number;
  /** Fraction (0..1) of accepted orders that reached `completed`. Null when no accepted orders. */
  fulfillmentRate: number | null;
  /** Fraction (0..1) of orders that were disputed (regardless of resolution). */
  disputeRate: number;
}

// Postgres returns numerics + PERCENTILE_CONT results as strings under
// postgres-js. COUNT() is bigint — cast to ::int in SQL so the math is
// number arithmetic, not string concatenation (the classic '5'/'10'=NaN
// trap documented in app/(dashboard)/dashboard/page.tsx). PERCENTILE_CONT
// gets ::numeric so parseFloat at the boundary works on a clean string.
// `db.execute<T>` requires T extend Record<string, unknown> (Drizzle's
// generic constraint). Closed-shape fields are the meaningful API; the
// trailing index signature satisfies the constraint without weakening
// callers — they read these specific keys, the index just acknowledges
// "yes, additional unknown keys could exist."
type ReputationRow = {
  total: number;
  responded: number;
  accepted: number;
  completed: number;
  cancelled: number;
  disputed: number;
  response_time_median_ms: string | null;
} & Record<string, unknown>;

function bucketFor(medianMs: number | null): ResponseTimeBucket | null {
  if (medianMs === null) return null;
  const hours = medianMs / (1000 * 60 * 60);
  if (hours < 1) return 'fast';
  if (hours < 24) return 'within-day';
  if (hours < 48) return 'within-2-days';
  return 'slow';
}

export function bucketLabel(bucket: ResponseTimeBucket): string {
  switch (bucket) {
    case 'fast':
      return 'an hour';
    case 'within-day':
      return 'a day';
    case 'within-2-days':
      return '2 days';
    case 'slow':
      return 'a few days';
  }
}

const WINDOW_DAYS = 90;
const WINDOW_ORDER_LIMIT = 30;

async function loadSellerReputation(artisanProfileId: string): Promise<SellerReputation> {
  const windowStart = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const rows = await db.execute<ReputationRow>(sql`
    WITH recent_orders AS (
      SELECT id, status, placed_at, accepted_at, declined_at, completed_at, disputed_at
      FROM orders
      WHERE artisan_profile_id = ${artisanProfileId}
        AND placed_at >= ${windowStart}
      ORDER BY placed_at DESC
      LIMIT ${WINDOW_ORDER_LIMIT}
    )
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE accepted_at IS NOT NULL OR declined_at IS NOT NULL)::int AS responded,
      COUNT(*) FILTER (WHERE accepted_at IS NOT NULL)::int AS accepted,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status IN ('cancelled_by_buyer', 'cancelled_by_seller', 'auto_cancelled'))::int AS cancelled,
      COUNT(*) FILTER (WHERE disputed_at IS NOT NULL)::int AS disputed,
      (PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (COALESCE(accepted_at, declined_at) - placed_at)) * 1000
      ) FILTER (WHERE accepted_at IS NOT NULL OR declined_at IS NOT NULL))::numeric AS response_time_median_ms
    FROM recent_orders
  `);

  const row = rows[0];
  if (!row || row.total === 0) {
    return {
      totalOrdersInWindow: 0,
      responseTimeMedianMs: null,
      responseTimeBucket: null,
      responseRate: 0,
      fulfillmentRate: null,
      disputeRate: 0,
    };
  }

  const medianMs =
    row.response_time_median_ms === null ? null : parseFloat(row.response_time_median_ms);
  const responseRate = row.total > 0 ? row.responded / row.total : 0;
  const fulfillmentRate = row.accepted > 0 ? row.completed / row.accepted : null;
  const disputeRate = row.total > 0 ? row.disputed / row.total : 0;

  return {
    totalOrdersInWindow: row.total,
    responseTimeMedianMs: medianMs,
    responseTimeBucket: bucketFor(medianMs),
    responseRate,
    fulfillmentRate,
    disputeRate,
  };
}

// Per-artisan cache key + tag so transitionOrder's
// revalidateTag(`reputation:${artisanId}`) invalidates exactly the one
// affected artisan, not every seller in the system. Global tag would
// tank the cache hit rate on any non-trivial volume of transitions.
//
// 5-minute TTL is the floor: even if the tag invalidation path misses
// (e.g. a CLI-driven transition where revalidateTag falls back to no-op,
// see lib/actions/orders.ts), reputation self-corrects within five
// minutes. `unstable_cache` is still supported under Next 16 and we're
// not using Cache Components — see facets.ts for the same rationale.
export function getSellerReputationCached(artisanProfileId: string): Promise<SellerReputation> {
  return unstable_cache(
    () => loadSellerReputation(artisanProfileId),
    ['seller-reputation', artisanProfileId],
    { revalidate: 300, tags: [`reputation:${artisanProfileId}`] },
  )();
}

// Privacy stance: aggregate counts and rates over the 90-day window are
// intentionally public-facing — that's the whole point of reputation as
// a trust signal in the absence of escrow. Sellers don't opt out of
// having their fulfillment rate visible. Per-order data (buyer identity,
// shipping address, prices, dispute statements) stays cross-party-
// private — only the aggregate is public.
