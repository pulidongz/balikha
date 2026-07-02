import { and, asc, count, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products, wishlistItems } from '@/db/schema';
import { decodeCursor, encodeCursor } from './cursor';
import { clampLimit, type Page, type PageRequest } from './paginate';

// Returns the set of product IDs currently in the user's wishlist.
// Anonymous callers (userId === null) get an empty set, so the caller can
// blindly `.has(productId)` without branching on auth state.
//
// Single index hit on `wishlist_items_user_idx`; intended to be called once
// per page render and the resulting set passed down to whichever cards
// render. Per the buyer plan §6: "Trivial cost (single index hit, returns
// a small set)."
export async function getWishlistProductIds(userId: string | null): Promise<Set<string>> {
  if (!userId) return new Set();
  const rows = await db
    .select({ productId: wishlistItems.productId })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId));
  return new Set(rows.map((r) => r.productId));
}

export interface WishlistRow {
  id: string;
  slug: string;
  title: string;
  // Null for showcase / commission works — render no price.
  price: string | null;
  currency: string;
  artisanShopSlug: string;
  artisanShopName: string;
  primaryImage: { url: string; altText: string | null } | null;
  // Keyset fields: the wishlist ROW's createdAt/id (not the product's), since
  // that is the sort order. Exposed so the caller can build the next cursor.
  addedAt: Date;
  wishlistId: string;
}

/**
 * One page of a user's wishlist, most-recently-added first, cursor-paginated.
 *
 * Deliberately does NOT filter by product status — a buyer who wishlisted a
 * piece that later went archived/sold still sees it. Keyset is on
 * (wishlistItems.createdAt, wishlistItems.id) so the ordering is stable across
 * concurrent adds. Fetches limit+1 to detect a next page without a count query.
 */
export async function getWishlistPage(
  userId: string,
  req: PageRequest = {},
): Promise<Page<WishlistRow>> {
  const limit = clampLimit(req.limit);
  const cursor = req.cursor ? decodeCursor(req.cursor) : null;

  const rows = await db
    .select({
      wishlistId: wishlistItems.id,
      addedAt: wishlistItems.createdAt,
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      currency: products.currency,
      artisanShopSlug: artisanProfiles.shopSlug,
      artisanShopName: artisanProfiles.shopName,
    })
    .from(wishlistItems)
    .innerJoin(products, eq(wishlistItems.productId, products.id))
    .innerJoin(artisanProfiles, eq(products.artisanProfileId, artisanProfiles.id))
    .where(
      cursor
        ? and(
            eq(wishlistItems.userId, userId),
            or(
              lt(wishlistItems.createdAt, cursor.createdAt),
              and(eq(wishlistItems.createdAt, cursor.createdAt), lt(wishlistItems.id, cursor.id)),
            ),
          )
        : eq(wishlistItems.userId, userId),
    )
    .orderBy(desc(wishlistItems.createdAt), desc(wishlistItems.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;

  // First image per product, fetched in one IN-list query rather than N+1.
  const primaryByProductId = new Map<string, { url: string; altText: string | null }>();
  if (visible.length > 0) {
    const imageRows = await db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        altText: productImages.altText,
      })
      .from(productImages)
      .where(
        inArray(
          productImages.productId,
          visible.map((p) => p.id),
        ),
      )
      .orderBy(asc(productImages.position));
    for (const img of imageRows) {
      if (!primaryByProductId.has(img.productId)) {
        primaryByProductId.set(img.productId, { url: img.url, altText: img.altText });
      }
    }
  }

  const items: WishlistRow[] = visible.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    price: p.price,
    currency: p.currency,
    artisanShopSlug: p.artisanShopSlug,
    artisanShopName: p.artisanShopName,
    primaryImage: primaryByProductId.get(p.id) ?? null,
    addedAt: p.addedAt,
    wishlistId: p.wishlistId,
  }));

  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.addedAt, last.wishlistId) : null,
  };
}

// Accurate total for the page header (the paginated list can't report it).
// Single indexed COUNT on wishlist_items by userId.
export async function countWishlistItems(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(wishlistItems)
    .where(eq(wishlistItems.userId, userId));
  return row?.value ?? 0;
}
