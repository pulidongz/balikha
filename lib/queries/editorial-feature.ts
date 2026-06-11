import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, homepageFeature, productImages, products } from '@/db/schema';

export interface EditorialFeature {
  artisan: {
    id: string;
    shopSlug: string;
    shopName: string;
    location: string | null;
    bio: string | null;
    bannerImageUrl: string | null;
    profilePhotoUrl: string | null;
  } | null;
  editorialText: string | null;
  works: Array<{
    id: string;
    slug: string;
    title: string;
    price: string | null;
    currency: string;
    artisanShopSlug: string;
    artisanShopName: string;
    primaryImage: { url: string; altText: string | null } | null;
  }>;
}

/**
 * The founder-curated homepage feature (T15), fully resolved. Returns
 * null when nothing is configured. Unpublished/removed works drop out
 * silently; the curated ORDER of featuredProductIds is preserved.
 */
export async function getEditorialFeature(): Promise<EditorialFeature | null> {
  const [row] = await db.select().from(homepageFeature).limit(1);
  if (!row) return null;

  let artisan: EditorialFeature['artisan'] = null;
  if (row.artisanProfileId) {
    const [a] = await db
      .select({
        id: artisanProfiles.id,
        shopSlug: artisanProfiles.shopSlug,
        shopName: artisanProfiles.shopName,
        location: artisanProfiles.location,
        bio: artisanProfiles.bio,
        bannerImageUrl: artisanProfiles.bannerImageUrl,
        profilePhotoUrl: artisanProfiles.profilePhotoUrl,
      })
      .from(artisanProfiles)
      .where(eq(artisanProfiles.id, row.artisanProfileId))
      .limit(1);
    artisan = a ?? null;
  }

  let works: EditorialFeature['works'] = [];
  if (row.featuredProductIds.length > 0) {
    const workRows = await db
      .select({
        id: products.id,
        slug: products.slug,
        title: products.title,
        price: products.price,
        currency: products.currency,
        artisanShopSlug: artisanProfiles.shopSlug,
        artisanShopName: artisanProfiles.shopName,
      })
      .from(products)
      .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
      .where(and(inArray(products.id, row.featuredProductIds), eq(products.status, 'published')));

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
          workRows.map((w) => w.id),
        ),
      )
      .orderBy(asc(productImages.position));
    const primaryByProductId = new Map<string, { url: string; altText: string | null }>();
    for (const img of imageRows) {
      if (!primaryByProductId.has(img.productId)) primaryByProductId.set(img.productId, img);
    }

    const byId = new Map(workRows.map((w) => [w.id, w]));
    works = row.featuredProductIds
      .map((id) => byId.get(id))
      .filter((w): w is NonNullable<typeof w> => w !== undefined)
      .map((w) => ({ ...w, primaryImage: primaryByProductId.get(w.id) ?? null }));
  }

  if (!artisan && works.length === 0) return null;
  return { artisan, editorialText: row.editorialText, works };
}
