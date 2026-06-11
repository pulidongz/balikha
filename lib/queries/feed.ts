import { and, asc, desc, eq, inArray, lt, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import { artisanFollows, artisanProfiles, productImages, products } from '@/db/schema';
import { decodeCursor, encodeCursor } from './cursor';
import { clampLimit, type Page, type PageRequest } from './paginate';

export interface FeedItemRow {
  id: string;
  slug: string;
  title: string;
  // Null for showcase / commission works (T3) — render no price.
  price: string | null;
  currency: string;
  createdAt: Date;
  artisanShopSlug: string;
  artisanShopName: string;
  artisanPhotoUrl: string | null;
  primaryImage: { url: string; altText: string | null } | null;
}

/**
 * Reverse-chronological published works from the studios `userId` follows.
 *
 * Same keyset pagination as getRecentProducts — (createdAt DESC, id DESC)
 * with the two-clause cursor predicate, limit+1 for hasMore — so pages stay
 * stable while new work lands between requests.
 */
export async function getFollowedFeed(
  userId: string,
  req: PageRequest = {},
): Promise<Page<FeedItemRow>> {
  const limit = clampLimit(req.limit);
  const cursor = req.cursor ? decodeCursor(req.cursor) : null;

  const followedAndPublished = and(
    eq(artisanFollows.userId, userId),
    eq(products.status, 'published'),
  );

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
      artisanPhotoUrl: artisanProfiles.profilePhotoUrl,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .innerJoin(artisanFollows, eq(artisanFollows.artisanProfileId, artisanProfiles.id))
    .where(
      cursor
        ? and(
            followedAndPublished,
            or(
              lt(products.createdAt, cursor.createdAt),
              and(eq(products.createdAt, cursor.createdAt), lt(products.id, cursor.id)),
            ),
          )
        : followedAndPublished,
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

  const items: FeedItemRow[] = visible.map((p) => ({
    ...p,
    primaryImage: primaryByProductId.get(p.id) ?? null,
  }));

  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export interface StudioToFollowRow {
  id: string;
  shopSlug: string;
  shopName: string;
  location: string | null;
  bannerImageUrl: string | null;
  productCount: number;
}

/**
 * Studios worth suggesting to `userId`: at least one published work, not
 * already followed, newest studios first (same editorial stance as the
 * homepage hero — a strip frames makers, it does not rank them).
 */
export async function getStudiosToFollow(
  userId: string,
  limit: number,
): Promise<StudioToFollowRow[]> {
  const followedIds = db
    .select({ id: artisanFollows.artisanProfileId })
    .from(artisanFollows)
    .where(eq(artisanFollows.userId, userId));

  return db
    .select({
      id: artisanProfiles.id,
      shopSlug: artisanProfiles.shopSlug,
      shopName: artisanProfiles.shopName,
      location: artisanProfiles.location,
      bannerImageUrl: artisanProfiles.bannerImageUrl,
      productCount: sql<number>`count(${products.id})::int`,
    })
    .from(artisanProfiles)
    .innerJoin(products, eq(products.artisanProfileId, artisanProfiles.id))
    .where(and(eq(products.status, 'published'), notInArray(artisanProfiles.id, followedIds)))
    .groupBy(artisanProfiles.id)
    .orderBy(desc(artisanProfiles.createdAt))
    .limit(limit);
}

/** True when the user follows at least one studio. */
export async function followsAnyStudio(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ userId: artisanFollows.userId })
    .from(artisanFollows)
    .where(eq(artisanFollows.userId, userId))
    .limit(1);
  return Boolean(row);
}
