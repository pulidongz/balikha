'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { and, eq, inArray } from 'drizzle-orm';
import { db, type Tx } from '@/db';
import {
  artisanFollows,
  catalogs,
  notifications,
  productImages,
  products,
  wishlistItems,
} from '@/db/schema';
import { uniqueSlug } from '@/lib/slug';
import {
  assertVerifiedEmail,
  getCurrentUser,
  NOT_AUTHENTICATED_MESSAGE,
  requireOwnership,
  tryRequireArtisan,
} from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { workPath } from '@/lib/routes';
import { logger } from '@/lib/logger';
import { FACET_TAG } from '@/lib/search/facets';
import { deleteObject } from '@/lib/storage/delete';
import {
  productCreateSchema,
  productStatusSchema,
  productUpdateSchema,
  type ProductStatus,
} from '@/lib/validators/product';
import { logArtisanMilestoneOnce } from '@/lib/analytics/log';

// Build the structured input object the schema expects, from a FormData
// whose fields are flat strings. Materials becomes an array; dimensions
// becomes a nested object. Empty fields drop to undefined so schema defaults
// or .optional() behavior kick in.
function inputFromFormData(formData: FormData) {
  const get = (k: string): string | undefined => {
    const v = formData.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };

  const materialsRaw = get('materials');
  const materials = materialsRaw
    ? materialsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const w = get('width');
  const h = get('height');
  const d = get('depth');
  const u = get('unit');
  const dims =
    w || h || d || u
      ? {
          width: w,
          height: h,
          depth: d,
          unit: u,
        }
      : undefined;

  return {
    title: get('title'),
    description: get('description'),
    salesMode: get('salesMode'),
    price: get('price'),
    currency: get('currency'),
    stockOnHand: get('stockOnHand'),
    weightGrams: get('weightGrams'),
    materials,
    dimensions: dims,
    technique: get('technique'),
    careInstructions: get('careInstructions'),
  };
}

// Resolve the commerce columns from the validated sales mode. Non-sale works
// always persist price NULL / stock 0 — predictable over clever: switching a
// work back to for_sale asks the artist for a fresh price rather than
// silently resurrecting a stale one. Returns null only on a state the
// validator already rejects (for_sale without price) — callers treat that as
// invalid input, never as a default to paper over.
function resolveCommerceFields(input: {
  salesMode: 'for_sale' | 'showcase' | 'commission_inquiries';
  price?: string;
  stockOnHand: number;
}): { price: string | null; stockOnHand: number } | null {
  if (input.salesMode !== 'for_sale') return { price: null, stockOnHand: 0 };
  if (input.price === undefined) return null;
  return { price: input.price, stockOnHand: input.stockOnHand };
}

export async function createProductAction(
  catalogId: string,
  formData: FormData,
): Promise<Result<{ slug: string; productId: string }>> {
  const profile = await tryRequireArtisan();
  if (!profile) return err('You must have an artisan profile.');

  // Email verification can lapse after an email change even for an existing
  // artisan, so gate listing creation on it (getCurrentUser is request-cached).
  const user = await getCurrentUser();
  if (!user) return err(NOT_AUTHENTICATED_MESSAGE);
  const verified = assertVerifiedEmail(user);
  if (!verified.ok) return err(verified.error);

  // Verify catalog ownership before doing anything expensive.
  const [catalog] = await db
    .select({ id: catalogs.id, artisanProfileId: catalogs.artisanProfileId })
    .from(catalogs)
    .where(eq(catalogs.id, catalogId))
    .limit(1);
  try {
    requireOwnership(catalog, profile.id);
  } catch {
    return err('You do not own this catalog.');
  }

  const parsed = productCreateSchema.safeParse({ catalogId, ...inputFromFormData(formData) });
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }
  const {
    title,
    description,
    salesMode,
    currency,
    weightGrams,
    materials,
    dimensions,
    technique,
    careInstructions,
  } = parsed.data;
  const commerce = resolveCommerceFields(parsed.data);
  if (!commerce) return err('Price is required for works that are for sale.');

  // Slug must be unique within the artisan, not the catalog (composite
  // unique index on products(artisan_profile_id, slug)). Probe by that
  // exact pair so the lookup uses the index.
  const slug = await uniqueSlug(title, async (candidate) => {
    const [row] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.artisanProfileId, profile.id), eq(products.slug, candidate)))
      .limit(1);
    return Boolean(row);
  });

  const [created] = await db
    .insert(products)
    .values({
      catalogId,
      artisanProfileId: profile.id,
      slug,
      title,
      description: description ?? null,
      salesMode,
      price: commerce.price,
      currency,
      stockOnHand: commerce.stockOnHand,
      status: 'draft',
      dimensions: dimensions ?? null,
      materials: materials ?? null,
      technique: technique ?? null,
      careInstructions: careInstructions ?? null,
      weightGrams: weightGrams ?? null,
    })
    .returning({ id: products.id });
  if (!created) return err('Failed to create product.');

  revalidatePath('/dashboard/catalogs');
  revalidateTag(FACET_TAG, 'max');
  return ok({ slug, productId: created.id });
}

export async function updateProductAction(
  productId: string,
  formData: FormData,
): Promise<Result<null>> {
  const profile = await tryRequireArtisan();
  if (!profile) return err('You must have an artisan profile.');

  // Email verification can lapse after an email change even for an existing
  // artisan, so gate listing edits on it (getCurrentUser is request-cached).
  const user = await getCurrentUser();
  if (!user) return err(NOT_AUTHENTICATED_MESSAGE);
  const verified = assertVerifiedEmail(user);
  if (!verified.ok) return err(verified.error);

  const [product] = await db
    .select({ id: products.id, artisanProfileId: products.artisanProfileId })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  try {
    requireOwnership(product, profile.id);
  } catch {
    return err('You do not own this product.');
  }

  const parsed = productUpdateSchema.safeParse(inputFromFormData(formData));
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }
  const {
    title,
    description,
    salesMode,
    currency,
    weightGrams,
    materials,
    dimensions,
    technique,
    careInstructions,
  } = parsed.data;
  const commerce = resolveCommerceFields(parsed.data);
  if (!commerce) return err('Price is required for works that are for sale.');

  // Wrapped in a tx so the back-in-stock notification fan-out either
  // commits with the update or rolls back together — same rationale as
  // setProductStatusAction's follow_new_listing trigger.
  await db.transaction(async (tx) => {
    const [prev] = await tx
      .select({
        slug: products.slug,
        status: products.status,
        stockOnHand: products.stockOnHand,
      })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);

    await tx
      .update(products)
      .set({
        title,
        description: description ?? null,
        salesMode,
        price: commerce.price,
        currency,
        stockOnHand: commerce.stockOnHand,
        dimensions: dimensions ?? null,
        materials: materials ?? null,
        technique: technique ?? null,
        careInstructions: careInstructions ?? null,
        weightGrams: weightGrams ?? null,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));

    // Stock-driven back-in-stock: previous was unavailable, now available.
    // Status only changes via setProductStatusAction, so prev.status here
    // is identical to the new status — that simplifies the predicate.
    // Only for_sale works participate: "back in stock" is meaningless for
    // showcase/commission pieces (their stock is pinned to 0 anyway).
    if (prev) {
      const wasUnavailable = prev.status === 'sold_out' || prev.stockOnHand === 0;
      const isAvailable =
        salesMode === 'for_sale' && prev.status === 'published' && commerce.stockOnHand > 0;
      if (wasUnavailable && isAvailable) {
        await emitWishlistBackInStock(tx, {
          productId,
          productTitle: title,
          productSlug: prev.slug,
          shopName: profile.shopName,
          shopSlug: profile.shopSlug,
        });
      }
    }
  });

  revalidatePath('/dashboard/catalogs');
  revalidateTag(FACET_TAG, 'max');
  return ok(null);
}

// Applies a status to one owned product inside an existing transaction,
// running the notification fan-out the single-product path has always
// had: follower new-listing on a transition into `published`, and
// wishlist back-in-stock when a sold-out/zero-stock product becomes
// available. Returns `{ found: false, published: false }` when the
// product is not found or not owned by `profile` (ownership is enforced
// in the WHERE) so a bulk caller can skip it without failing the whole
// batch. `published` is true iff this call moved the product INTO the
// published state — the seller-funnel signal for `first_listing`.
async function applyProductStatusInTx(
  tx: Tx,
  profile: { id: string; shopName: string; shopSlug: string; approvalStatus: string },
  productId: string,
  status: ProductStatus,
): Promise<{ found: boolean; published: boolean }> {
  // Defense-in-depth: a transition INTO 'published' requires an approved
  // seller profile. The primary user-facing gate lives in the two publish
  // actions (setProductStatusAction, setProductsStatusAction), before the
  // transaction opens. This assertion is a backstop — it runs inside the
  // transaction to enforce the invariant at the data layer regardless of
  // how the caller was reached. (Decision #6 in the plan.)
  if (status === 'published' && profile.approvalStatus !== 'approved') {
    throw new Error(
      `Unapproved seller (approvalStatus=${profile.approvalStatus}) attempted to publish product ${productId}`,
    );
  }

  // Read existing row with ownership constraint baked into the WHERE —
  // IDOR-safe even before any write happens.
  const [existing] = await tx
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      status: products.status,
      salesMode: products.salesMode,
      stockOnHand: products.stockOnHand,
      moderationStatus: products.moderationStatus,
    })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.artisanProfileId, profile.id)))
    .limit(1);
  if (!existing) return { found: false, published: false };

  // Defense-in-depth: a removed listing cannot be republished. The primary
  // user-facing gate lives in setProductStatusAction and setProductsStatusAction.
  // This backstop enforces the invariant at the data layer regardless of caller.
  if (status === 'published' && existing.moderationStatus === 'removed') {
    throw new Error(`Removed listing ${productId} cannot be republished`);
  }

  await tx
    .update(products)
    .set({ status, updatedAt: new Date() })
    .where(eq(products.id, productId));

  // True iff this call moves the product INTO published from any other
  // status — the seller-funnel publish signal. (Already-published →
  // published is a no-op and does not count.)
  const published = existing.status !== 'published' && status === 'published';

  // Notification fan-out: only when the product transitions INTO the
  // published state from anywhere else. Already-published → published
  // is a no-op and intentionally doesn't re-notify.
  if (published) {
    const followers = await tx
      .select({ userId: artisanFollows.userId })
      .from(artisanFollows)
      .where(eq(artisanFollows.artisanProfileId, profile.id));

    if (followers.length > 0) {
      await tx.insert(notifications).values(
        followers.map((f) => ({
          userId: f.userId,
          type: 'follow_new_listing' as const,
          title: `${profile.shopName} listed a new piece`,
          body: existing.title,
          target: {
            kind: 'product',
            id: productId,
            url: workPath(profile.shopSlug, existing.slug),
          },
        })),
      );
    }
  }

  // Back-in-stock: status flipped from sold_out → published while stock
  // is positive. (The stock-driven path lives in updateProductAction.)
  // Only for_sale works participate — non-sale works have stock pinned to 0.
  const wasUnavailable = existing.status === 'sold_out' || existing.stockOnHand === 0;
  const isAvailable =
    existing.salesMode === 'for_sale' && status === 'published' && existing.stockOnHand > 0;
  if (wasUnavailable && isAvailable) {
    await emitWishlistBackInStock(tx, {
      productId,
      productTitle: existing.title,
      productSlug: existing.slug,
      shopName: profile.shopName,
      shopSlug: profile.shopSlug,
    });
  }

  return { found: true, published };
}

export async function setProductStatusAction(
  productId: string,
  status: ProductStatus,
): Promise<Result<null>> {
  const profile = await tryRequireArtisan();
  if (!profile) return err('You must have an artisan profile.');

  const parsedStatus = productStatusSchema.safeParse(status);
  if (!parsedStatus.success) return err('Invalid status.');

  // Email-verification gate for publishing (mirrors createProductAction):
  // verification can lapse after an email change even for an approved seller, so
  // re-check before putting a listing live. Non-publish transitions
  // (draft/archive/sold_out) are intentionally not gated.
  if (parsedStatus.data === 'published') {
    const user = await getCurrentUser();
    if (!user) return err(NOT_AUTHENTICATED_MESSAGE);
    const verified = assertVerifiedEmail(user);
    if (!verified.ok) return err(verified.error);
  }

  // Primary approval gate (seller-level authorization, Decision #6).
  // Checked before opening the transaction so the rejection is fast and clear.
  if (parsedStatus.data === 'published' && profile.approvalStatus !== 'approved') {
    logger.warn(
      { userId: profile.userId, approvalStatus: profile.approvalStatus },
      'Blocked publish attempt by unapproved seller',
    );
    return err(
      'Your seller account is pending approval — you can save drafts but cannot publish yet.',
    );
  }

  // Primary moderation gate (ticket #31). A removed listing cannot be
  // republished; only an admin can reinstate it. Checked before the transaction.
  if (parsedStatus.data === 'published') {
    const [row] = await db
      .select({ moderationStatus: products.moderationStatus })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.artisanProfileId, profile.id)))
      .limit(1);
    if (row?.moderationStatus === 'removed') {
      return err('This listing was removed by an administrator and cannot be republished.');
    }
  }

  // Wrapped in a transaction so the notification fan-out commits with the
  // status change or rolls back together.
  const result = await db.transaction((tx) =>
    applyProductStatusInTx(tx, profile, productId, parsedStatus.data),
  );
  if (!result.found) return err('Product not found or not owned.');

  revalidatePath('/dashboard/catalogs');
  revalidateTag(FACET_TAG, 'max');

  if (result.published) {
    // Lifetime milestone — the helper no-ops if this artisan has ever
    // had a first_listing recorded, so sell-out/republish never
    // re-fires it.
    await logArtisanMilestoneOnce({
      type: 'first_listing',
      artisanProfileId: profile.id,
      userId: profile.userId,
      entityType: 'product',
      entityId: productId,
    });
  }
  return ok(null);
}

// Bulk counterpart of setProductStatusAction: apply one status to many
// owned products in a single transaction. Each product runs the same
// per-product logic — ownership check and notification fan-out — via the
// shared helper; ids the seller doesn't own are skipped rather than
// failing the batch, so a stray id can't sink the whole request.
// Returns how many products were actually updated.
export async function setProductsStatusAction(
  productIds: string[],
  status: ProductStatus,
): Promise<Result<{ updated: number }>> {
  const profile = await tryRequireArtisan();
  if (!profile) return err('You must have an artisan profile.');

  const parsedStatus = productStatusSchema.safeParse(status);
  if (!parsedStatus.success) return err('Invalid status.');

  // Email-verification gate for publishing (mirrors createProductAction), same
  // as the single-product action. Non-publish transitions are not gated.
  if (parsedStatus.data === 'published') {
    const user = await getCurrentUser();
    if (!user) return err(NOT_AUTHENTICATED_MESSAGE);
    const verified = assertVerifiedEmail(user);
    if (!verified.ok) return err(verified.error);
  }

  // Primary approval gate (Decision #6). Reject the whole bulk request once,
  // before the transaction opens — no partial publish, no per-product error.
  if (parsedStatus.data === 'published' && profile.approvalStatus !== 'approved') {
    logger.warn(
      { userId: profile.userId, approvalStatus: profile.approvalStatus },
      'Blocked bulk publish attempt by unapproved seller',
    );
    return err(
      'Your seller account is pending approval — you can save drafts but cannot publish yet.',
    );
  }

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return err('Select at least one product.');
  }
  if (productIds.length > 200) {
    return err('Too many products selected at once. Select 200 or fewer.');
  }

  // Primary moderation gate (ticket #31). Reject the whole batch if any
  // product was admin-removed — no partial publish, mirrors approval gate.
  if (parsedStatus.data === 'published') {
    const removedRows = await db
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          inArray(products.id, productIds),
          eq(products.artisanProfileId, profile.id),
          eq(products.moderationStatus, 'removed'),
        ),
      );
    if (removedRows.length > 0) {
      return err(
        'One or more listings were removed by an administrator and cannot be republished.',
      );
    }
  }

  const publishedIds: string[] = [];
  const updated = await db.transaction(async (tx) => {
    let countUpdated = 0;
    for (const id of productIds) {
      const r = await applyProductStatusInTx(tx, profile, id, parsedStatus.data);
      if (r.found) {
        countUpdated += 1;
        if (r.published) publishedIds.push(id);
      }
    }
    return countUpdated;
  });

  revalidatePath('/dashboard/catalogs');
  revalidateTag(FACET_TAG, 'max');

  const firstPublishedId = publishedIds[0];
  if (firstPublishedId) {
    await logArtisanMilestoneOnce({
      type: 'first_listing',
      artisanProfileId: profile.id,
      userId: profile.userId,
      entityType: 'product',
      entityId: firstPublishedId,
    });
  }
  return ok({ updated });
}

export async function deleteProductImageAction(imageId: string): Promise<Result<null>> {
  const profile = await tryRequireArtisan();
  if (!profile) return err('You must have an artisan profile.');

  // Image ownership comes via JOIN to the parent product. Also fetch
  // storageKey so we can delete the underlying object after the row is gone.
  const [imageRow] = await db
    .select({
      id: productImages.id,
      storageKey: productImages.storageKey,
      artisanProfileId: products.artisanProfileId,
    })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(eq(productImages.id, imageId))
    .limit(1);
  try {
    requireOwnership(imageRow, profile.id);
  } catch {
    return err('You do not own this image.');
  }

  await db.delete(productImages).where(eq(productImages.id, imageId));

  // S3 cleanup is best-effort and only applies to images we own in our
  // bucket. External URLs (seeded placeholders, future hot-linked imports)
  // have storageKey=null and we leave them alone — not ours to delete.
  if (imageRow?.storageKey) {
    await deleteObject(imageRow.storageKey);
  }

  revalidatePath('/dashboard/catalogs');
  return ok(null);
}

// --- Notification triggers --------------------------------------------------

interface BackInStockContext {
  productId: string;
  productTitle: string;
  productSlug: string;
  shopName: string;
  shopSlug: string;
}

// Bulk-insert wishlist_back_in_stock notifications inside an existing tx.
// Caller decides WHEN to emit (i.e. detects the transition); this helper
// just owns the fan-out shape so the two callers don't drift.
async function emitWishlistBackInStock(tx: Tx, ctx: BackInStockContext): Promise<void> {
  const wishers = await tx
    .select({ userId: wishlistItems.userId })
    .from(wishlistItems)
    .where(eq(wishlistItems.productId, ctx.productId));

  if (wishers.length === 0) return;

  await tx.insert(notifications).values(
    wishers.map((w) => ({
      userId: w.userId,
      type: 'wishlist_back_in_stock' as const,
      title: `${ctx.productTitle} is back in stock`,
      body: `From ${ctx.shopName}`,
      target: {
        kind: 'product',
        id: ctx.productId,
        url: workPath(ctx.shopSlug, ctx.productSlug),
      },
    })),
  );
}
