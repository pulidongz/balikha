'use server';

import { revalidatePath, revalidateTag } from 'next/cache';
import { and, eq } from 'drizzle-orm';
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
import { requireArtisan, requireOwnership } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { FACET_TAG } from '@/lib/search/facets';
import { deleteObject } from '@/lib/storage/delete';
import {
  productCreateSchema,
  productStatusSchema,
  productUpdateSchema,
  type ProductStatus,
} from '@/lib/validators/product';

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
    price: get('price'),
    currency: get('currency'),
    stockOnHand: get('stockOnHand'),
    weightGrams: get('weightGrams'),
    materials,
    dimensions: dims,
  };
}

export async function createProductAction(
  catalogId: string,
  formData: FormData,
): Promise<Result<{ slug: string }>> {
  const profile = await requireArtisan().catch(() => null);
  if (!profile) return err('You must have an artisan profile.');

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
  const { title, description, price, currency, stockOnHand, weightGrams, materials, dimensions } =
    parsed.data;

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

  await db.insert(products).values({
    catalogId,
    artisanProfileId: profile.id,
    slug,
    title,
    description: description ?? null,
    price,
    currency,
    stockOnHand,
    status: 'draft',
    dimensions: dimensions ?? null,
    materials: materials ?? null,
    weightGrams: weightGrams ?? null,
  });

  revalidatePath('/dashboard/catalogs');
  revalidateTag(FACET_TAG, 'max');
  return ok({ slug });
}

export async function updateProductAction(
  productId: string,
  formData: FormData,
): Promise<Result<null>> {
  const profile = await requireArtisan().catch(() => null);
  if (!profile) return err('You must have an artisan profile.');

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
  const { title, description, price, currency, stockOnHand, weightGrams, materials, dimensions } =
    parsed.data;

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
        price,
        currency,
        stockOnHand,
        dimensions: dimensions ?? null,
        materials: materials ?? null,
        weightGrams: weightGrams ?? null,
        updatedAt: new Date(),
      })
      .where(eq(products.id, productId));

    // Stock-driven back-in-stock: previous was unavailable, now available.
    // Status only changes via setProductStatusAction, so prev.status here
    // is identical to the new status — that simplifies the predicate.
    if (prev) {
      const wasUnavailable = prev.status === 'sold_out' || prev.stockOnHand === 0;
      const isAvailable = prev.status === 'published' && stockOnHand > 0;
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
// available. Returns false when the product is not found or not owned by
// `profile` (ownership is enforced in the WHERE) so a bulk caller can
// skip it without failing the whole batch.
async function applyProductStatusInTx(
  tx: Tx,
  profile: { id: string; shopName: string; shopSlug: string },
  productId: string,
  status: ProductStatus,
): Promise<boolean> {
  // Read existing row with ownership constraint baked into the WHERE —
  // IDOR-safe even before any write happens.
  const [existing] = await tx
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      status: products.status,
      stockOnHand: products.stockOnHand,
    })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.artisanProfileId, profile.id)))
    .limit(1);
  if (!existing) return false;

  await tx
    .update(products)
    .set({ status, updatedAt: new Date() })
    .where(eq(products.id, productId));

  // Notification fan-out: only when the product transitions INTO the
  // published state from anywhere else. Already-published → published
  // is a no-op and intentionally doesn't re-notify.
  if (existing.status !== 'published' && status === 'published') {
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
            url: `/shop/${profile.shopSlug}/${existing.slug}`,
          },
        })),
      );
    }
  }

  // Back-in-stock: status flipped from sold_out → published while stock
  // is positive. (The stock-driven path lives in updateProductAction.)
  const wasUnavailable = existing.status === 'sold_out' || existing.stockOnHand === 0;
  const isAvailable = status === 'published' && existing.stockOnHand > 0;
  if (wasUnavailable && isAvailable) {
    await emitWishlistBackInStock(tx, {
      productId,
      productTitle: existing.title,
      productSlug: existing.slug,
      shopName: profile.shopName,
      shopSlug: profile.shopSlug,
    });
  }

  return true;
}

export async function setProductStatusAction(
  productId: string,
  status: ProductStatus,
): Promise<Result<null>> {
  const profile = await requireArtisan().catch(() => null);
  if (!profile) return err('You must have an artisan profile.');

  const parsedStatus = productStatusSchema.safeParse(status);
  if (!parsedStatus.success) return err('Invalid status.');

  // Wrapped in a transaction so the notification fan-out commits with the
  // status change or rolls back together.
  const found = await db.transaction((tx) =>
    applyProductStatusInTx(tx, profile, productId, parsedStatus.data),
  );
  if (!found) return err('Product not found or not owned.');

  revalidatePath('/dashboard/catalogs');
  revalidateTag(FACET_TAG, 'max');
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
  const profile = await requireArtisan().catch(() => null);
  if (!profile) return err('You must have an artisan profile.');

  const parsedStatus = productStatusSchema.safeParse(status);
  if (!parsedStatus.success) return err('Invalid status.');

  if (!Array.isArray(productIds) || productIds.length === 0) {
    return err('Select at least one product.');
  }
  if (productIds.length > 200) {
    return err('Too many products selected at once. Select 200 or fewer.');
  }

  const updated = await db.transaction(async (tx) => {
    let count = 0;
    for (const id of productIds) {
      if (await applyProductStatusInTx(tx, profile, id, parsedStatus.data)) {
        count += 1;
      }
    }
    return count;
  });

  revalidatePath('/dashboard/catalogs');
  revalidateTag(FACET_TAG, 'max');
  return ok({ updated });
}

export async function deleteProductImageAction(imageId: string): Promise<Result<null>> {
  const profile = await requireArtisan().catch(() => null);
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
        url: `/shop/${ctx.shopSlug}/${ctx.productSlug}`,
      },
    })),
  );
}
