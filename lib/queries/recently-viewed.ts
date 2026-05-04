import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products, recentlyViewed } from '@/db/schema';

export interface RecentlyViewedItem {
  id: string;
  slug: string;
  title: string;
  price: string;
  currency: string;
  artisanShopSlug: string;
  artisanShopName: string;
  primaryImage: { url: string; altText: string | null } | null;
}

// Most recently viewed published products for a user, capped at `limit`.
// Anonymous users get an empty array. Status is filtered to 'published'
// so an archived/sold-out piece doesn't reappear in the strip after the
// artisan pulled it.
export async function getRecentlyViewed(
  userId: string | null,
  limit = 8,
): Promise<RecentlyViewedItem[]> {
  if (!userId) return [];

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      title: products.title,
      price: products.price,
      currency: products.currency,
      artisanShopSlug: artisanProfiles.shopSlug,
      artisanShopName: artisanProfiles.shopName,
      lastViewedAt: recentlyViewed.lastViewedAt,
    })
    .from(recentlyViewed)
    .innerJoin(products, eq(products.id, recentlyViewed.productId))
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .where(and(eq(recentlyViewed.userId, userId), eq(products.status, 'published')))
    .orderBy(desc(recentlyViewed.lastViewedAt))
    .limit(limit);

  if (rows.length === 0) return [];

  // Fetch primary images in one shot.
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
        rows.map((r) => r.id),
      ),
    )
    .orderBy(asc(productImages.position));

  const primaryById = new Map<string, { url: string; altText: string | null }>();
  for (const img of imageRows) {
    if (!primaryById.has(img.productId)) {
      primaryById.set(img.productId, { url: img.url, altText: img.altText });
    }
  }

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    price: r.price,
    currency: r.currency,
    artisanShopSlug: r.artisanShopSlug,
    artisanShopName: r.artisanShopName,
    primaryImage: primaryById.get(r.id) ?? null,
  }));
}
