import { eq } from 'drizzle-orm';
import type { Tx } from '@/db';
import { artisanProfiles, products } from '@/db/schema';

// Pure transaction helpers for admin product moderation (ticket #31).
// The server actions in lib/actions/admin-products.ts wrap these with auth,
// notification, email, and audit. Kept pure + tx-based so they are testable
// in a rolled-back transaction (scripts/check-admin-product-moderation.ts).
// NB: these intentionally never touch products.previousStatus, which is
// owned by the suspend/ban reconciler. `Tx` is the shared transaction type
// exported from '@/db' (the same one lib/admin/seller-content.ts uses).

export type ModerationTarget = {
  productId: string;
  artisanProfileId: string;
  sellerUserId: string;
  title: string;
};

async function loadProduct(tx: Tx, productId: string) {
  const [row] = await tx
    .select({
      id: products.id,
      artisanProfileId: products.artisanProfileId,
      sellerUserId: artisanProfiles.userId,
      title: products.title,
      status: products.status,
      moderationStatus: products.moderationStatus,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(eq(products.id, productId))
    .limit(1);
  if (!row) {
    throw new Error(`product-moderation: product ${productId} not found`);
  }
  return row;
}

/** Hard takedown: unpublish (status -> archived) and mark removed. */
export async function removeListingInTx(
  tx: Tx,
  input: { productId: string; reason: string; adminUserId: string },
): Promise<ModerationTarget> {
  const product = await loadProduct(tx, input.productId);
  await tx
    .update(products)
    .set({
      status: 'archived',
      moderationStatus: 'removed',
      moderationReason: input.reason,
      moderatedAt: new Date(),
      moderatedBy: input.adminUserId,
      updatedAt: new Date(),
    })
    .where(eq(products.id, input.productId));
  return {
    productId: product.id,
    artisanProfileId: product.artisanProfileId,
    sellerUserId: product.sellerUserId,
    title: product.title,
  };
}

/** Soft flag: leave lifecycle status untouched; mark for admin attention. */
export async function flagListingInTx(
  tx: Tx,
  input: { productId: string; reason: string; adminUserId: string },
): Promise<ModerationTarget> {
  const product = await loadProduct(tx, input.productId);
  await tx
    .update(products)
    .set({
      moderationStatus: 'flagged',
      moderationReason: input.reason,
      moderatedAt: new Date(),
      moderatedBy: input.adminUserId,
      updatedAt: new Date(),
    })
    .where(eq(products.id, input.productId));
  return {
    productId: product.id,
    artisanProfileId: product.artisanProfileId,
    sellerUserId: product.sellerUserId,
    title: product.title,
  };
}

/**
 * Clear moderation. If the listing had been removed (status archived by the
 * takedown), restore it to published. A previously-flagged listing keeps its
 * status (it was never unpublished).
 */
export async function reinstateListingInTx(
  tx: Tx,
  input: { productId: string; adminUserId: string },
): Promise<ModerationTarget> {
  const product = await loadProduct(tx, input.productId);
  const restoreStatus = product.moderationStatus === 'removed' ? 'published' : product.status;
  await tx
    .update(products)
    .set({
      status: restoreStatus,
      moderationStatus: 'none',
      moderationReason: null,
      moderatedAt: null,
      moderatedBy: null,
      updatedAt: new Date(),
    })
    .where(eq(products.id, input.productId));
  return {
    productId: product.id,
    artisanProfileId: product.artisanProfileId,
    sellerUserId: product.sellerUserId,
    title: product.title,
  };
}
