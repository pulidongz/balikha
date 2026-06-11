import { and, asc, desc, eq, inArray, lt, notInArray, or, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  artisanFollows,
  artisanProfiles,
  productImages,
  products,
  studioUpdateImages,
  studioUpdates,
} from '@/db/schema';
import { decodeCursor, encodeCursor } from './cursor';
import { clampLimit, type Page, type PageRequest } from './paginate';

export interface FeedWorkItem {
  kind: 'work';
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

export interface FeedUpdateItem {
  kind: 'update';
  id: string;
  body: string;
  createdAt: Date;
  artisanShopSlug: string;
  artisanShopName: string;
  artisanPhotoUrl: string | null;
  images: Array<{ url: string }>;
}

export type FeedItem = FeedWorkItem | FeedUpdateItem;

/**
 * Reverse-chronological feed from the studios `userId` follows: published
 * works (T6) merged with studio updates (T9).
 *
 * Pagination: both sources share one total order — (createdAt DESC, id
 * DESC) — and the same two-clause keyset predicate, so merging their
 * top-(limit+1) rows and slicing preserves keyset stability: a row sits
 * strictly before or after the cursor in BOTH queries, never both sides.
 */
export async function getFollowedFeed(
  userId: string,
  req: PageRequest = {},
): Promise<Page<FeedItem>> {
  const limit = clampLimit(req.limit);
  const cursor = req.cursor ? decodeCursor(req.cursor) : null;

  const followedAndPublished = and(
    eq(artisanFollows.userId, userId),
    eq(products.status, 'published'),
  );

  const workRows = await db
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

  const followedUpdates = eq(artisanFollows.userId, userId);
  const updateRows = await db
    .select({
      id: studioUpdates.id,
      body: studioUpdates.body,
      createdAt: studioUpdates.createdAt,
      artisanShopSlug: artisanProfiles.shopSlug,
      artisanShopName: artisanProfiles.shopName,
      artisanPhotoUrl: artisanProfiles.profilePhotoUrl,
    })
    .from(studioUpdates)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, studioUpdates.artisanProfileId))
    .innerJoin(artisanFollows, eq(artisanFollows.artisanProfileId, artisanProfiles.id))
    .where(
      cursor
        ? and(
            followedUpdates,
            or(
              lt(studioUpdates.createdAt, cursor.createdAt),
              and(eq(studioUpdates.createdAt, cursor.createdAt), lt(studioUpdates.id, cursor.id)),
            ),
          )
        : followedUpdates,
    )
    .orderBy(desc(studioUpdates.createdAt), desc(studioUpdates.id))
    .limit(limit + 1);

  // Merge under the shared total order, then slice. hasMore must consider
  // BOTH the slice overflow and either source having more beyond its own
  // limit+1 window.
  const merged: FeedItem[] = [
    ...workRows.map((p) => ({ ...p, kind: 'work' as const, primaryImage: null })),
    ...updateRows.map((u) => ({ ...u, kind: 'update' as const, images: [] })),
  ].sort((a, b) =>
    a.createdAt.getTime() !== b.createdAt.getTime()
      ? b.createdAt.getTime() - a.createdAt.getTime()
      : b.id.localeCompare(a.id),
  );

  const hasMore = merged.length > limit;
  const visible = merged.slice(0, limit);

  // Batch image lookups per kind.
  const workIds = visible.filter((i) => i.kind === 'work').map((i) => i.id);
  if (workIds.length > 0) {
    const imageRows = await db
      .select({
        productId: productImages.productId,
        url: productImages.url,
        altText: productImages.altText,
      })
      .from(productImages)
      .where(inArray(productImages.productId, workIds))
      .orderBy(asc(productImages.position));
    const primaryByProductId = new Map<string, { url: string; altText: string | null }>();
    for (const img of imageRows) {
      if (!primaryByProductId.has(img.productId)) primaryByProductId.set(img.productId, img);
    }
    for (const item of visible) {
      if (item.kind === 'work') item.primaryImage = primaryByProductId.get(item.id) ?? null;
    }
  }

  const updateIds = visible.filter((i) => i.kind === 'update').map((i) => i.id);
  if (updateIds.length > 0) {
    const imageRows = await db
      .select({
        updateId: studioUpdateImages.updateId,
        url: studioUpdateImages.url,
      })
      .from(studioUpdateImages)
      .where(inArray(studioUpdateImages.updateId, updateIds))
      .orderBy(asc(studioUpdateImages.position));
    const imagesByUpdate = new Map<string, Array<{ url: string }>>();
    for (const img of imageRows) {
      const list = imagesByUpdate.get(img.updateId) ?? [];
      list.push({ url: img.url });
      imagesByUpdate.set(img.updateId, list);
    }
    for (const item of visible) {
      if (item.kind === 'update') item.images = imagesByUpdate.get(item.id) ?? [];
    }
  }

  const last = visible[visible.length - 1];
  return {
    items: visible,
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
