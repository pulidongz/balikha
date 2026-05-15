// Order lifecycle timeout tick.
//
// Two passes per run, each capped at 100 rows (chunked rather than one
// giant transaction — if cron skipped a run and there's a backlog, the
// next tick handles more, no single batch holds locks too long):
//
//   1. Auto-cancel orders in `pending_seller_response` whose placedAt
//      is older than ORDER_SELLER_RESPONSE_TIMEOUT_HOURS. Cancellation
//      reason is `seller_no_response`. Stock returns to the product.
//
//   2. Auto-complete orders in `shipped` whose shippedAt is older than
//      ORDER_BUYER_AUTO_CONFIRM_DAYS. Marks the order completed so the
//      seller's fulfillment-rate denominator credits the sale.
//
// Both routes call `transitionOrder` with `actorRole: 'system'` and
// `actorUserId: null` so the audit log records the absence of a human
// actor. Per the Phase 4.5 rules, system events skip notification
// fan-out but DO invalidate the per-artisan reputation cache (the
// asymmetry is intentional: notifications wait for the messaging plan
// to design quiet-hours/digesting; reputation can't wait because
// auto-cancels should drop fulfillment rate immediately).
//
// Time override for testing: pass `--now=2026-06-01T00:00:00Z` to
// pretend "now" is that timestamp. Useful for verifying timeout
// behavior without actually waiting 48 hours.
//
// Run via: `npm run orders:tick`

import 'dotenv/config';
import { and, asc, eq, lt } from 'drizzle-orm';
import { db } from '@/db';
import { orders } from '@/db/schema';
import { transitionOrder } from '@/lib/actions/orders';
import { returnStockIfPreShipment } from '@/lib/orders/stock';
import { env } from '@/env';
import { logger } from '@/lib/logger';

const BATCH_SIZE = 100;

function getNow(): Date {
  const override = process.argv.find((a) => a.startsWith('--now='))?.split('=')[1];
  if (!override) return new Date();
  const parsed = new Date(override);
  if (Number.isNaN(parsed.getTime())) {
    logger.error({ override }, 'Invalid --now= value, must be parseable by Date');
    process.exit(2);
  }
  return parsed;
}

async function autoCancelStaleResponses(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - env.ORDER_SELLER_RESPONSE_TIMEOUT_HOURS * 60 * 60 * 1000);

  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, 'pending_seller_response'), lt(orders.placedAt, cutoff)))
    // Oldest-first so a backlog (skipped cron run) drains FIFO — the
    // longest-overdue orders are auto-cancelled before newer ones.
    .orderBy(asc(orders.placedAt))
    .limit(BATCH_SIZE);

  let processed = 0;
  for (const row of stale) {
    const result = await transitionOrder({
      orderId: row.id,
      expectedFrom: ['pending_seller_response'],
      toStatus: 'auto_cancelled',
      actorUserId: null,
      actorRole: 'system',
      // CLI context — no Next request scope for revalidateTag; readers
      // re-derive reputation on the 5-minute cache TTL.
      skipRevalidation: true,
      eventType: 'auto_cancelled',
      fieldUpdates: {
        cancelledAt: now,
        cancellationReason: 'seller_no_response',
      },
      metadataJson: {
        reason: 'seller_no_response',
        thresholdHours: env.ORDER_SELLER_RESPONSE_TIMEOUT_HOURS,
      },
      onTransition: returnStockIfPreShipment,
    });
    if (result.ok) {
      processed += 1;
    } else {
      // expectedFrom mismatch is benign — another path (manual cancel,
      // accept) raced us between SELECT and the transition. Log + skip.
      logger.warn(
        { orderId: row.id, error: result.error },
        'Auto-cancel skipped (transition rejected)',
      );
    }
  }
  return processed;
}

async function autoCompleteStaleShipments(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - env.ORDER_BUYER_AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000);

  const stale = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, 'shipped'), lt(orders.shippedAt, cutoff)))
    // Oldest-first so a backlog drains FIFO — the longest-shipped
    // orders are auto-completed before newer ones.
    .orderBy(asc(orders.shippedAt))
    .limit(BATCH_SIZE);

  let processed = 0;
  for (const row of stale) {
    const result = await transitionOrder({
      orderId: row.id,
      expectedFrom: ['shipped'],
      toStatus: 'completed',
      actorUserId: null,
      actorRole: 'system',
      // CLI context — no Next request scope for revalidateTag; readers
      // re-derive reputation on the 5-minute cache TTL.
      skipRevalidation: true,
      eventType: 'completed',
      fieldUpdates: { completedAt: now },
      metadataJson: {
        reason: 'buyer_auto_confirm',
        thresholdDays: env.ORDER_BUYER_AUTO_CONFIRM_DAYS,
      },
    });
    if (result.ok) {
      processed += 1;
    } else {
      logger.warn(
        { orderId: row.id, error: result.error },
        'Auto-complete skipped (transition rejected)',
      );
    }
  }
  return processed;
}

async function main(): Promise<void> {
  const now = getNow();
  logger.info(
    {
      now: now.toISOString(),
      sellerResponseTimeoutHours: env.ORDER_SELLER_RESPONSE_TIMEOUT_HOURS,
      buyerAutoConfirmDays: env.ORDER_BUYER_AUTO_CONFIRM_DAYS,
    },
    'Order tick: starting',
  );

  const cancelled = await autoCancelStaleResponses(now);
  const completed = await autoCompleteStaleShipments(now);

  logger.info({ cancelled, completed }, 'Order tick: done');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    logger.error({ err: e }, 'Order tick failed');
    process.exit(1);
  });
