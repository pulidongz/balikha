import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products } from '@/db/schema';
import { dailyPick, manilaDateKey } from '@/lib/queries/daily-index';

export interface AuthPanelMedia {
  images: string[]; // the chosen product's image URLs, ordered by position; [0] = primary
  workTitle: string;
  shopName: string;
  shopSlug: string;
  productSlug: string;
}

// Media for the auth pages' editorial side panel: a daily, fair rotation across
// artists (one artist per Manila day via rendezvous hashing), showing the
// multiple photos of that artist's newest published piece as a slideshow. No
// eligible artist → null (the layout renders the navy brand panel). Never an
// empty/broken panel.
//
// Published-only is intentional — the entry surface features currently-buyable
// work, and the caption deep-links to the piece (sold_out pieces never headline).
//
// Eligibility = "has >=1 published product with an image". No approvalStatus
// filter is needed: publishing requires an approved seller (enforced in the
// publish actions and as a transaction backstop in lib/actions/product.ts), and
// suspension takes published products down — so a published product implies an
// approved, non-suspended artisan.
export async function getAuthPanelMedia(): Promise<AuthPanelMedia | null> {
  // Distinct eligible artists. Order is irrelevant — dailyPick is
  // order-independent (rendezvous + id tie-break).
  const eligible = await db
    .selectDistinct({ id: artisanProfiles.id })
    .from(artisanProfiles)
    .innerJoin(products, eq(products.artisanProfileId, artisanProfiles.id))
    .innerJoin(productImages, eq(productImages.productId, products.id))
    .where(eq(products.status, 'published'));

  if (eligible.length === 0) return null;

  const chosenId = dailyPick(
    manilaDateKey(new Date()),
    eligible.map((e) => e.id),
  );

  // The chosen artist's representative piece: newest published product that has
  // an image. (The productImages join guarantees >=1 image exists.)
  const [product] = await db
    .select({
      id: products.id,
      title: products.title,
      slug: products.slug,
      shopName: artisanProfiles.shopName,
      shopSlug: artisanProfiles.shopSlug,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .innerJoin(productImages, eq(productImages.productId, products.id))
    .where(and(eq(products.artisanProfileId, chosenId), eq(products.status, 'published')))
    .orderBy(desc(products.createdAt))
    .limit(1);

  if (!product) return null;

  // All of that product's images, ordered (position 0 first = primary).
  const imageRows = await db
    .select({ url: productImages.url })
    .from(productImages)
    .where(eq(productImages.productId, product.id))
    .orderBy(asc(productImages.position));

  const images = imageRows.map((r) => r.url);
  // Eligibility guarantees images; if a race emptied them, degrade to the
  // legitimate no-photo state rather than throwing on an auth page.
  if (images.length === 0) return null;

  return {
    images,
    workTitle: product.title,
    shopName: product.shopName,
    shopSlug: product.shopSlug,
    productSlug: product.slug,
  };
}
