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
//
// `ReputationRow` is the closed shape — a typo'd field access is a
// compile error, not silent `unknown`. `db.execute<T>` requires
// T extend Record<string, unknown> (Drizzle's generic constraint), so
// the open index signature is applied ONLY at the call site below as
// `ReputationRow & Record<string, unknown>`, never on the type itself.
type ReputationRow = {
  artisan_profile_id: string;
  total: number;
  responded: number;
  accepted: number;
  completed: number;
  cancelled: number;
  disputed: number;
  response_time_median_ms: string | null;
};

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

// Reputation window. WINDOW_DAYS is applied in SQL as
// `LOCALTIMESTAMP - make_interval(days => …)` rather than via a JS Date
// parameter: orders.placed_at is `timestamp without time zone`, and
// postgres-js cannot bind a raw Date param on a raw db.execute() query
// (it throws ERR_INVALID_ARG_TYPE). Computing the cutoff in SQL avoids
// the bound-Date entirely.
const WINDOW_DAYS = 90;
const WINDOW_ORDER_LIMIT = 30;

const EMPTY_REPUTATION: SellerReputation = {
  totalOrdersInWindow: 0,
  responseTimeMedianMs: null,
  responseTimeBucket: null,
  responseRate: 0,
  fulfillmentRate: null,
  disputeRate: 0,
};

// Maps one aggregate SQL row to the public SellerReputation shape.
// Shared by the single-artisan and batch loaders so the rate math has
// exactly one definition.
//
// `accepted` counts only accepted orders that have CONCLUDED (terminal
// or disputed) — an order still in flight (`shipped`, `payment_received`,
// …) is neither fulfilled nor failed yet, so it must not sit in the
// fulfillment-rate denominator. Including it makes a seller with one
// in-progress order read as "0% fulfilled" until that order completes.
function rowToReputation(row: ReputationRow): SellerReputation {
  if (row.total === 0) return EMPTY_REPUTATION;

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

async function loadSellerReputation(artisanProfileId: string): Promise<SellerReputation> {
  const rows = await db.execute<ReputationRow & Record<string, unknown>>(sql`
    WITH recent_orders AS (
      SELECT id, artisan_profile_id, status, placed_at, accepted_at, declined_at, completed_at, disputed_at
      FROM orders
      WHERE artisan_profile_id = ${artisanProfileId}
        AND placed_at >= LOCALTIMESTAMP - make_interval(days => ${WINDOW_DAYS})
      ORDER BY placed_at DESC
      LIMIT ${WINDOW_ORDER_LIMIT}
    )
    SELECT
      ${artisanProfileId}::uuid AS artisan_profile_id,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE accepted_at IS NOT NULL OR declined_at IS NOT NULL)::int AS responded,
      COUNT(*) FILTER (WHERE accepted_at IS NOT NULL AND status IN ('completed', 'cancelled_by_buyer', 'cancelled_by_seller', 'auto_cancelled', 'disputed'))::int AS accepted,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status IN ('cancelled_by_buyer', 'cancelled_by_seller', 'auto_cancelled'))::int AS cancelled,
      COUNT(*) FILTER (WHERE disputed_at IS NOT NULL)::int AS disputed,
      (PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (COALESCE(accepted_at, declined_at) - placed_at)) * 1000
      ) FILTER (WHERE accepted_at IS NOT NULL OR declined_at IS NOT NULL))::numeric AS response_time_median_ms
    FROM recent_orders
  `);

  const row = rows[0];
  if (!row) return EMPTY_REPUTATION;
  return rowToReputation(row);
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

// Batch loader for product-card grids — one SQL query for every artisan
// in a listing instead of N round-trips. The per-artisan `LIMIT 30`
// window (last 30 orders OR last 90 days, the same rule as the single
// loader) is reproduced with ROW_NUMBER() PARTITION BY artisan_profile_id;
// the outer aggregate then GROUPs BY artisan. Artisans with zero orders
// in the window simply don't appear in the result — the caller defaults
// them to EMPTY_REPUTATION via getSellerReputationsForArtisans.
async function loadSellerReputations(
  artisanProfileIds: string[],
): Promise<Map<string, SellerReputation>> {
  const result = new Map<string, SellerReputation>();
  if (artisanProfileIds.length === 0) return result;

  // Each id is bound as its own parameter via sql.join — never string-
  // concatenated — so the IN list is injection-safe regardless of length.
  const idList = sql.join(
    artisanProfileIds.map((id) => sql`${id}`),
    sql`, `,
  );

  const rows = await db.execute<ReputationRow & Record<string, unknown>>(sql`
    WITH ranked_orders AS (
      SELECT
        artisan_profile_id, status, placed_at, accepted_at, declined_at, completed_at, disputed_at,
        ROW_NUMBER() OVER (
          PARTITION BY artisan_profile_id ORDER BY placed_at DESC
        ) AS rn
      FROM orders
      WHERE artisan_profile_id IN (${idList})
        AND placed_at >= LOCALTIMESTAMP - make_interval(days => ${WINDOW_DAYS})
    ),
    recent_orders AS (
      SELECT * FROM ranked_orders WHERE rn <= ${WINDOW_ORDER_LIMIT}
    )
    SELECT
      artisan_profile_id,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE accepted_at IS NOT NULL OR declined_at IS NOT NULL)::int AS responded,
      COUNT(*) FILTER (WHERE accepted_at IS NOT NULL AND status IN ('completed', 'cancelled_by_buyer', 'cancelled_by_seller', 'auto_cancelled', 'disputed'))::int AS accepted,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE status IN ('cancelled_by_buyer', 'cancelled_by_seller', 'auto_cancelled'))::int AS cancelled,
      COUNT(*) FILTER (WHERE disputed_at IS NOT NULL)::int AS disputed,
      (PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY EXTRACT(EPOCH FROM (COALESCE(accepted_at, declined_at) - placed_at)) * 1000
      ) FILTER (WHERE accepted_at IS NOT NULL OR declined_at IS NOT NULL))::numeric AS response_time_median_ms
    FROM recent_orders
    GROUP BY artisan_profile_id
  `);

  for (const row of rows) {
    result.set(row.artisan_profile_id, rowToReputation(row));
  }
  return result;
}

// Cached batch reputation lookup for product-card grids. Keyed on the
// sorted id list so the same listing reuses one cache entry; tagged with
// every artisan's `reputation:${id}` so transitionOrder's per-artisan
// revalidateTag still busts this entry when any seller in the batch has
// an order transition. Returns a Map covering EVERY requested id —
// artisans with no orders in the window get EMPTY_REPUTATION.
//
// The cached function returns a plain Record, not a Map: unstable_cache
// persists results via JSON serialization, and a Map round-trips to {}.
// The Map is rebuilt from the Record after the cache boundary.
export async function getSellerReputationsForArtisans(
  artisanProfileIds: string[],
): Promise<Map<string, SellerReputation>> {
  const uniqueIds = Array.from(new Set(artisanProfileIds)).sort();
  if (uniqueIds.length === 0) return new Map<string, SellerReputation>();

  const record = await unstable_cache(
    async () => {
      const loaded = await loadSellerReputations(uniqueIds);
      const complete: Record<string, SellerReputation> = {};
      for (const id of uniqueIds) {
        complete[id] = loaded.get(id) ?? EMPTY_REPUTATION;
      }
      return complete;
    },
    ['seller-reputations-batch', uniqueIds.join(',')],
    { revalidate: 300, tags: uniqueIds.map((id) => `reputation:${id}`) },
  )();

  return new Map(Object.entries(record));
}

// Privacy stance: aggregate counts and rates over the 90-day window are
// intentionally public-facing — that's the whole point of reputation as
// a trust signal in the absence of escrow. Sellers don't opt out of
// having their fulfillment rate visible. Per-order data (buyer identity,
// shipping address, prices, dispute statements) stays cross-party-
// private — only the aggregate is public.
