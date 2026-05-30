import { headers } from 'next/headers';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { analyticsEvents } from '@/db/schema';
import type { analyticsEventType } from '@/db/schema';
import { logger } from '@/lib/logger';

const REQUEST_ID_HEADER = 'x-request-id';

// Derived from the pgEnum so the DB and TS stay in lock-step — adding a
// value in db/schema/app.ts widens this union automatically.
export type AnalyticsEventType = (typeof analyticsEventType.enumValues)[number];

/**
 * Append one row to `analytics_events`. This is the project's second
 * sanctioned telemetry boundary (the first is lib/search/log.ts):
 * analytics is non-essential, so a DB hiccup here MUST NOT break the
 * user action it instruments. The whole body is wrapped in try/catch;
 * failures go to Pino and the function returns normally.
 *
 * Callers MUST NOT add their own try/catch around this — the helper
 * owns that. Callers `await` it AFTER their primary mutation has
 * committed (never inside a db.transaction callback: this insert uses
 * `db`, not the caller's `tx`, so it would not roll back with the
 * caller and could record a phantom event).
 *
 * `request_id` is read defensively — `next/headers` has no request
 * scope in CLI callers (e.g. the orders:tick sweep that auto-completes
 * orders), so the read degrades to null rather than throwing.
 */
export async function logAnalyticsEvent(opts: {
  type: AnalyticsEventType;
  userId?: string | null;
  artisanProfileId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    let requestId: string | null = null;
    try {
      const h = await headers();
      requestId = h.get(REQUEST_ID_HEADER) ?? null;
    } catch {
      // No request scope (CLI / background caller). request_id is
      // best-effort debugging context, not required — leave it null.
      requestId = null;
    }

    await db.insert(analyticsEvents).values({
      type: opts.type,
      userId: opts.userId ?? null,
      artisanProfileId: opts.artisanProfileId ?? null,
      entityType: opts.entityType ?? null,
      entityId: opts.entityId ?? null,
      metadata: opts.metadata ?? null,
      requestId,
    });
  } catch (e) {
    logger.error({ err: e, type: opts.type }, 'Failed to log analytics event');
  }
}

/**
 * Emit a once-per-artisan lifetime milestone (`first_listing`,
 * `first_order`) only if no event of this type has EVER been recorded
 * for the artisan. The append-only analytics_events log is itself the
 * durable lifetime record, so this is correct across unpublish /
 * sell-out / republish cycles where a mutable product/order COUNT would
 * mis-fire (a sold-out product drops out of `status='published'`).
 *
 * At-least-once, not exactly-once: the existence check and the insert
 * are not atomic, so two genuinely-concurrent first-time actions can
 * both emit. Downstream aggregation must dedupe by DISTINCT
 * artisan_profile_id (see the analytics_events table docblock). Owns
 * its try/catch like logAnalyticsEvent — never throws. On an existence-
 * check failure it skips the emit (safer to under-emit a milestone than
 * to risk a duplicate on a transient error).
 */
export async function logArtisanMilestoneOnce(opts: {
  type: Extract<AnalyticsEventType, 'first_listing' | 'first_order'>;
  artisanProfileId: string;
  userId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
}): Promise<void> {
  try {
    const [existing] = await db
      .select({ id: analyticsEvents.id })
      .from(analyticsEvents)
      .where(
        and(
          eq(analyticsEvents.type, opts.type),
          eq(analyticsEvents.artisanProfileId, opts.artisanProfileId),
        ),
      )
      .limit(1);
    if (existing) return;
  } catch (e) {
    logger.error({ err: e, type: opts.type }, 'Milestone existence check failed');
    return;
  }

  await logAnalyticsEvent({
    type: opts.type,
    userId: opts.userId ?? null,
    artisanProfileId: opts.artisanProfileId,
    entityType: opts.entityType ?? null,
    entityId: opts.entityId ?? null,
  });
}
