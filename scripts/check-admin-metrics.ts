// Verifies the /admin overview metric helpers (ticket #29) against
// independently-computed queries on the same DB. Each check recomputes
// the metric a *different* way than the helper, so a logic bug in either
// path surfaces as a mismatch. Run against a seeded dev DB:
//   npm run db:seed && npm run test:admin-metrics
import { and, count, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';
import {
  countActiveSellers30d,
  countTotalProducts,
  countTotalUsers,
  formatRate,
  loadOrderMetrics,
} from '@/lib/queries/admin-metrics';

let failures = 0;

function assertString(name: string, actual: string, expected: string): void {
  if (actual === expected) {
    process.stdout.write(`✓ ${name}: "${actual}"\n`);
  } else {
    failures += 1;
    console.error(`✗ ${name}: got "${actual}" expected "${expected}"`);
  }
}

function assertEqual(name: string, actual: number, expected: number): void {
  if (actual === expected) {
    process.stdout.write(`✓ ${name}: ${actual}\n`);
  } else {
    failures += 1;
    console.error(`✗ ${name}: helper=${actual} expected=${expected}`);
  }
}

function assertRate(name: string, actual: number | null, expected: number | null): void {
  const close =
    (actual === null && expected === null) ||
    (actual !== null && expected !== null && Math.abs(actual - expected) < 1e-9);
  if (close) {
    process.stdout.write(`✓ ${name}: ${actual === null ? '—' : `${(actual * 100).toFixed(1)}%`}\n`);
  } else {
    failures += 1;
    console.error(`✗ ${name}: helper=${actual} expected=${expected}`);
  }
}

async function main(): Promise<void> {
  // formatRate — pure, DB-free guard for the null-rate contract
  // (Decision 4): empty marketplace -> "—", a real zero -> "0.0%". A
  // seeded DB always has orders, so the DB cross-checks below never
  // exercise the null branch — these three assertions are its only
  // coverage, and they catch a regression that returns 0 instead of null.
  assertString('formatRate(null)', formatRate(null), '—');
  assertString('formatRate(0)', formatRate(0), '0.0%');
  assertString('formatRate(0.1234)', formatRate(0.1234), '12.3%');

  // Users — independent: raw COUNT(*) vs helper's typed builder.
  const userRows = await db.execute<{ value: number } & Record<string, unknown>>(
    sql`SELECT COUNT(*)::int AS value FROM "user"`,
  );
  assertEqual('total users', await countTotalUsers(), userRows[0]?.value ?? -1);

  // Products — independent: raw COUNT(*) vs helper's typed builder.
  const productRows = await db.execute<{ value: number } & Record<string, unknown>>(
    sql`SELECT COUNT(*)::int AS value FROM products`,
  );
  assertEqual('total products', await countTotalProducts(), productRows[0]?.value ?? -1);

  // Active sellers (30d) — independent: two JOIN-based distinct sets unioned
  // in JS, vs the helper's EXISTS + COUNT(DISTINCT).
  const byProducts = await db.execute<{ id: string } & Record<string, unknown>>(sql`
    SELECT DISTINCT ap.id FROM artisan_profiles ap
    JOIN products p ON p.artisan_profile_id = ap.id
    WHERE ap.approval_status = 'approved'
      AND p.created_at >= LOCALTIMESTAMP - make_interval(days => 30)
  `);
  const byOrders = await db.execute<{ id: string } & Record<string, unknown>>(sql`
    SELECT DISTINCT ap.id FROM artisan_profiles ap
    JOIN orders o ON o.artisan_profile_id = ap.id
    WHERE ap.approval_status = 'approved'
      AND o.placed_at >= LOCALTIMESTAMP - make_interval(days => 30)
  `);
  const expectedActive = new Set([...byProducts.map((r) => r.id), ...byOrders.map((r) => r.id)])
    .size;
  assertEqual('active sellers (30d)', await countActiveSellers30d(), expectedActive);

  // Order metrics — independent: per-status typed-builder counts vs the
  // helper's single FILTER aggregate. Compare counts, then rates.
  const [placedRow] = await db.select({ value: count() }).from(orders);
  const [completedRow] = await db
    .select({ value: count() })
    .from(orders)
    .where(eq(orders.status, 'completed'));
  const [declinedRow] = await db
    .select({ value: count() })
    .from(orders)
    .where(and(eq(orders.status, 'cancelled_by_seller'), isNotNull(orders.declinedAt)));
  const [autoRow] = await db
    .select({ value: count() })
    .from(orders)
    .where(eq(orders.status, 'auto_cancelled'));

  const placed = placedRow?.value ?? 0;
  const completed = completedRow?.value ?? 0;
  const declined = declinedRow?.value ?? 0;
  const noResponse = autoRow?.value ?? 0;

  const metrics = await loadOrderMetrics();
  assertEqual('order volume', metrics.volume, placed);
  assertRate('completion rate', metrics.completionRate, placed > 0 ? completed / placed : null);
  assertRate('decline rate', metrics.declineRate, placed > 0 ? declined / placed : null);
  assertRate('no-response rate', metrics.noResponseRate, placed > 0 ? noResponse / placed : null);

  if (failures > 0) {
    console.error(`\n${failures} metric check(s) failed.`);
    process.exit(1);
  }
  process.stdout.write('\nAll admin-metric checks passed.\n');
  process.exit(0);
}

main().catch((error) => {
  console.error('check-admin-metrics crashed:', error);
  process.exit(1);
});
