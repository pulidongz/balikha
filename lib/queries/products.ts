import { and, asc, desc, eq, inArray, lt, or } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products } from '@/db/schema';
import { decodeCursor, encodeCursor } from './cursor';
import { clampLimit, type Page, type PageRequest } from './paginate';

export interface RecentProductRow {
  id: string;
  slug: string;
  title: string;
  // Null for showcase / commission works (T3) — render no price.
  price: string | null;
  currency: string;
  artisanShopSlug: string;
  artisanShopName: string;
  primaryImage: { url: string; altText: string | null } | null;
  createdAt: Date;
}

/**
 * Recent published products across all artisans, paginated by cursor.
 *
 * Sort order: createdAt DESC, id DESC. The (createdAt, id) keyset
 * predicate (`OR (createdAt < ?, AND createdAt = ? AND id < ?)`) is what
 * makes this stable under concurrent inserts — a new product appearing
 * between pages won't cause skipped or duplicated rows.
 *
 * Fetch limit+1 to detect a next page without a separate count query.
 */
export async function getRecentProducts(req: PageRequest = {}): Promise<Page<RecentProductRow>> {
  const limit = clampLimit(req.limit);
  const cursor = req.cursor ? decodeCursor(req.cursor) : null;

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      currency: products.currency,
      createdAt: products.createdAt,
      artisanShopSlug: artisanProfiles.shopSlug,
      artisanShopName: artisanProfiles.shopName,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(
      cursor
        ? and(
            eq(products.status, 'published'),
            or(
              lt(products.createdAt, cursor.createdAt),
              and(eq(products.createdAt, cursor.createdAt), lt(products.id, cursor.id)),
            ),
          )
        : eq(products.status, 'published'),
    )
    .orderBy(desc(products.createdAt), desc(products.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const visible = hasMore ? rows.slice(0, limit) : rows;

  // Primary image per product, in one inArray query.
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
      if (!primaryByProductId.has(img.productId)) primaryByProductId.set(img.productId, img);
    }
  }

  const items: RecentProductRow[] = visible.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    price: p.price,
    currency: p.currency,
    createdAt: p.createdAt,
    artisanShopSlug: p.artisanShopSlug,
    artisanShopName: p.artisanShopName,
    primaryImage: primaryByProductId.get(p.id) ?? null,
  }));

  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}
