import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { db } from '@/db';
import type { Tx } from '@/db';
import { artisanProfiles, products, user } from '@/db/schema';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// hideSellerListings
// ---------------------------------------------------------------------------
// For a seller (userId), archives every product that is currently `published`
// or `sold_out` and records the prior status in `previous_status`.  Only
// those two visible states are touched; the seller's self-`draft` /
// self-`archived` products are left untouched (presence of `previous_status`
// distinguishes admin-hidden from self-archived).
//
// Must be called inside the same Drizzle transaction as the suspend/ban action.
// ---------------------------------------------------------------------------
export async function hideSellerListings(userId: string, tx: Tx): Promise<void> {
  // Look up the seller's artisan profile id so we can scope the product query.
  const [profile] = await tx
    .select({ id: artisanProfiles.id })
    .from(artisanProfiles)
    .where(eq(artisanProfiles.userId, userId))
    .limit(1);

  // Not a seller — nothing to hide.
  if (!profile) return;

  // For each product that is currently visible (published or sold_out), copy
  // the current status into previous_status and flip to archived.
  // Drizzle does not support "SET col = other_col" directly, so we use a
  // subquery-less approach: select the rows, then update each batch.
  // Because we are inside a transaction the two-step is atomic.
  const visibleProducts = await tx
    .select({ id: products.id, status: products.status })
    .from(products)
    .where(
      and(
        eq(products.artisanProfileId, profile.id),
        inArray(products.status, ['published', 'sold_out']),
      ),
    );

  if (visibleProducts.length === 0) return;

  // Group by status so we do two updates at most instead of N.
  const publishedIds = visibleProducts.filter((p) => p.status === 'published').map((p) => p.id);
  const soldOutIds = visibleProducts.filter((p) => p.status === 'sold_out').map((p) => p.id);

  if (publishedIds.length > 0) {
    await tx
      .update(products)
      .set({ status: 'archived', previousStatus: 'published' })
      .where(inArray(products.id, publishedIds));
  }
  if (soldOutIds.length > 0) {
    await tx
      .update(products)
      .set({ status: 'archived', previousStatus: 'sold_out' })
      .where(inArray(products.id, soldOutIds));
  }
}

// ---------------------------------------------------------------------------
// restoreSellerListings
// ---------------------------------------------------------------------------
// Reverses hideSellerListings: for every product with `previous_status IS NOT
// NULL` belonging to this seller, sets `status = previous_status` and clears
// `previous_status`.  Only admin-hidden products (those with a recorded
// previous_status) are touched.
//
// Must be called inside the same Drizzle transaction as the unsuspend/unban
// action (or from the reconciler, which also wraps in a transaction).
// ---------------------------------------------------------------------------
export async function restoreSellerListings(userId: string, tx: Tx): Promise<number> {
  const [profile] = await tx
    .select({ id: artisanProfiles.id })
    .from(artisanProfiles)
    .where(eq(artisanProfiles.userId, userId))
    .limit(1);

  if (!profile) return 0;

  // Select only products that were admin-hidden (previousStatus IS NOT NULL).
  const hiddenProducts = await tx
    .select({ id: products.id, previousStatus: products.previousStatus })
    .from(products)
    .where(and(eq(products.artisanProfileId, profile.id), isNotNull(products.previousStatus)));

  if (hiddenProducts.length === 0) return 0;

  // Restore each prior status.  Group by previous_status to keep updates
  // minimal (two at most: published and sold_out).
  const toPublished = hiddenProducts
    .filter((p) => p.previousStatus === 'published')
    .map((p) => p.id);
  const toSoldOut = hiddenProducts.filter((p) => p.previousStatus === 'sold_out').map((p) => p.id);

  let count = 0;
  if (toPublished.length > 0) {
    await tx
      .update(products)
      .set({ status: 'published', previousStatus: null })
      .where(inArray(products.id, toPublished));
    count += toPublished.length;
  }
  if (toSoldOut.length > 0) {
    await tx
      .update(products)
      .set({ status: 'sold_out', previousStatus: null })
      .where(inArray(products.id, toSoldOut));
    count += toSoldOut.length;
  }
  return count;
}

// ---------------------------------------------------------------------------
// restoreExpiredSuspensions
// ---------------------------------------------------------------------------
// Reconciler that closes the gap between the Better Auth admin plugin's
// auto-unban (which clears `user.banned` at `banExpires` but never restores
// listings) and the actual product visibility.
//
// Finds every seller who has at least one product with `previous_status IS NOT
// NULL` (i.e. listings were admin-hidden at suspend/ban time) but whose user
// record now has `banned = false` (the plugin's timer auto-expired the ban).
// For each such seller, calls `restoreSellerListings` inside a transaction to
// restore the hidden listings to their prior statuses and clear `previous_status`.
//
// No-double-restore guarantee: the synchronous admin Unsuspend path already
// clears `previous_status` in its own transaction, so once a seller is
// restored there are no `previous_status IS NOT NULL` rows left and this
// reconciler will not pick them up again.
//
// A still-suspended/banned seller (`banned = true`) is ignored because the
// JOIN filters to `banned = false` only.
//
// Intended to be called by the `balikha-orders-tick` scheduled job so it
// rides the existing systemd unit — no new unit needed.
//
// Returns the number of sellers whose listings were restored.
// ---------------------------------------------------------------------------
export async function restoreExpiredSuspensions(): Promise<number> {
  // Find sellers who have admin-hidden products but are no longer banned.
  // The distinct on artisanProfiles.userId is implicit via the join key.
  const affected = await db
    .selectDistinct({ userId: artisanProfiles.userId })
    .from(products)
    .innerJoin(artisanProfiles, eq(products.artisanProfileId, artisanProfiles.id))
    .innerJoin(user, eq(artisanProfiles.userId, user.id))
    .where(and(isNotNull(products.previousStatus), eq(user.banned, false)));

  if (affected.length === 0) {
    logger.info('Suspension reconciler: no expired suspensions to restore');
    return 0;
  }

  let restored = 0;
  for (const row of affected) {
    try {
      const count = await db.transaction(async (tx) => restoreSellerListings(row.userId, tx));
      if (count > 0) restored += 1;
    } catch (e) {
      logger.warn(
        { userId: row.userId, error: e },
        'Failed to restore listings for seller — skipping',
      );
    }
  }

  logger.info({ restored }, 'Suspension reconciler: restored expired suspensions');
  return restored;
}
