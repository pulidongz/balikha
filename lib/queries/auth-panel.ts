import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products } from '@/db/schema';
import { getEditorialFeature } from '@/lib/queries/editorial-feature';

export interface AuthPanelMedia {
  imageUrl: string;
  workTitle: string;
  shopName: string;
}

// Photo for the auth pages' editorial side panel. Chain, each step
// explicit: founder-curated homepage feature → newest published work →
// null (the layout renders the navy brand panel without a photo).
// Never an empty/broken panel.
export async function getAuthPanelMedia(): Promise<AuthPanelMedia | null> {
  const feature = await getEditorialFeature();
  const featured = feature?.works.find((w) => w.primaryImage !== null);
  if (featured?.primaryImage) {
    return {
      imageUrl: featured.primaryImage.url,
      workTitle: featured.title,
      shopName: featured.artisanShopName,
    };
  }

  const [newest] = await db
    .select({
      title: products.title,
      shopName: artisanProfiles.shopName,
      imageUrl: productImages.url,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .innerJoin(productImages, eq(productImages.productId, products.id))
    .where(eq(products.status, 'published'))
    .orderBy(desc(products.createdAt), asc(productImages.position))
    .limit(1);
  if (!newest) return null;
  return { imageUrl: newest.imageUrl, workTitle: newest.title, shopName: newest.shopName };
}
