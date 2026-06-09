import { count, sql } from 'drizzle-orm';
import { db } from '@/db';
import { products, user } from '@/db/schema';

// Live metrics for the /admin overview (ticket #29). Read-only helpers that
// throw on driver error and let it propagate to the Next error boundary —
// the project's Result<T> convention is for mutations, not reads.

/** Total registered users, all roles/states. */
export async function countTotalUsers(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(user);
  // A COUNT query always returns exactly one row; a missing row means a
  // driver/Drizzle fault, not "0 users" — throw rather than coalesce, so a
  // fault never renders as a real zero (house no-fallback rule).
  if (!row) {
    throw new Error('countTotalUsers: count query returned no rows');
  }
  return row.value;
}

/** Total products across every status (draft/published/sold_out/archived). */
export async function countTotalProducts(): Promise<number> {
  const [row] = await db.select({ value: count() }).from(products);
  if (!row) {
    throw new Error('countTotalProducts: count query returned no rows');
  }
  return row.value;
}

/**
 * Approved sellers who, in the last 30 days, either created a listing OR
 * received an order. Window is computed in SQL (LOCALTIMESTAMP) because
 * postgres-js rejects a bound JS Date inside db.execute.
 */
export async function countActiveSellers30d(): Promise<number> {
  const rows = await db.execute<{ value: number } & Record<string, unknown>>(sql`
    SELECT COUNT(DISTINCT ap.id)::int AS value
    FROM artisan_profiles ap
    WHERE ap.approval_status = 'approved'
      AND (
        EXISTS (
          SELECT 1 FROM products p
          WHERE p.artisan_profile_id = ap.id
            AND p.created_at >= LOCALTIMESTAMP - make_interval(days => 30)
        )
        OR EXISTS (
          SELECT 1 FROM orders o
          WHERE o.artisan_profile_id = ap.id
            AND o.placed_at >= LOCALTIMESTAMP - make_interval(days => 30)
        )
      )
  `);
  const row = rows[0];
  if (!row) {
    throw new Error('countActiveSellers30d: aggregate query returned no rows');
  }
  return row.value;
}

export type OrderMetrics = {
  /** Total orders ever placed (every order row). */
  volume: number;
  /** completed / placed; null when there are no orders. */
  completionRate: number | null;
  /** seller declines (cancelled_by_seller + declined_at) / placed; null when no orders. */
  declineRate: number | null;
  /** no-response auto-cancellations / placed; null when no orders. */
  noResponseRate: number | null;
};

type OrderMetricsRow = {
  placed: number;
  completed: number;
  declined: number;
  no_response: number;
};

/**
 * All-time order lifecycle metrics. Decline = a seller-initiated decline
 * (status cancelled_by_seller with declined_at set); no-response =
 * auto_cancelled (the 48h seller-timeout sweep is its only producer).
 */
export async function loadOrderMetrics(): Promise<OrderMetrics> {
  const rows = await db.execute<OrderMetricsRow & Record<string, unknown>>(sql`
    SELECT
      COUNT(*)::int AS placed,
      COUNT(*) FILTER (WHERE status = 'completed')::int AS completed,
      COUNT(*) FILTER (
        WHERE status = 'cancelled_by_seller' AND declined_at IS NOT NULL
      )::int AS declined,
      COUNT(*) FILTER (WHERE status = 'auto_cancelled')::int AS no_response
    FROM orders
  `);
  const row = rows[0];
  if (!row) {
    throw new Error('loadOrderMetrics: aggregate query returned no rows');
  }
  const placed = row.placed;
  return {
    volume: placed,
    completionRate: placed > 0 ? row.completed / placed : null,
    declineRate: placed > 0 ? row.declined / placed : null,
    noResponseRate: placed > 0 ? row.no_response / placed : null,
  };
}

// Display formatter co-located with OrderMetrics so the null-rate contract
// (no orders -> em-dash, never "0%") lives next to the type that produces
// the nulls. Pure and DB-free, so it is unit-checkable without a database
// (see scripts/check-admin-metrics.ts) and importable by the RSC page
// without pulling server-only page deps into the check script.
export function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${(rate * 100).toFixed(1)}%`;
}
