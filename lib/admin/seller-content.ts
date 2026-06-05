import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { Tx } from '@/db';
import { artisanProfiles, products } from '@/db/schema';

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
export async function restoreSellerListings(userId: string, tx: Tx): Promise<void> {
  const [profile] = await tx
    .select({ id: artisanProfiles.id })
    .from(artisanProfiles)
    .where(eq(artisanProfiles.userId, userId))
    .limit(1);

  if (!profile) return;

  // Select only products that were admin-hidden (previousStatus IS NOT NULL).
  const hiddenProducts = await tx
    .select({ id: products.id, previousStatus: products.previousStatus })
    .from(products)
    .where(and(eq(products.artisanProfileId, profile.id), isNotNull(products.previousStatus)));

  if (hiddenProducts.length === 0) return;

  // Restore each prior status.  Group by previous_status to keep updates
  // minimal (two at most: published and sold_out).
  const toPublished = hiddenProducts
    .filter((p) => p.previousStatus === 'published')
    .map((p) => p.id);
  const toSoldOut = hiddenProducts.filter((p) => p.previousStatus === 'sold_out').map((p) => p.id);

  if (toPublished.length > 0) {
    await tx
      .update(products)
      .set({ status: 'published', previousStatus: null })
      .where(inArray(products.id, toPublished));
  }
  if (toSoldOut.length > 0) {
    await tx
      .update(products)
      .set({ status: 'sold_out', previousStatus: null })
      .where(inArray(products.id, toSoldOut));
  }
}
