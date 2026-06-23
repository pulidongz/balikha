import { and, asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products } from '@/db/schema';
import { dailyPick, manilaDateKey } from '@/lib/queries/daily-index';

export interface AuthPanelMedia {
  imageUrl: string;
  workTitle: string;
  shopName: string;
  shopSlug: string;
}

// Photo for the auth pages' editorial side panel. A daily, fair rotation across
// artists: one artist per Manila calendar day, chosen by rendezvous hashing
// (stable within the day; each artist equally likely regardless of catalog
// size), then their newest published piece. No eligible artist → null (the
// layout renders the navy brand panel without a photo). Never an empty/broken
// panel.
//
// Eligibility = "has >=1 published product with an image". No approvalStatus
// filter is needed: publishing requires an approved seller (enforced in the
// publish actions and as a transaction backstop in lib/actions/product.ts), and
// suspension takes published products down — so a published product implies an
// approved, non-suspended artisan. Same gating the rest of the public site
// relies on (product status, not an approval re-check).
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

  // The chosen artist's representative piece: newest published product with its
  // primary image (lowest position).
  const [piece] = await db
    .select({
      imageUrl: productImages.url,
      workTitle: products.title,
      shopName: artisanProfiles.shopName,
      shopSlug: artisanProfiles.shopSlug,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .innerJoin(productImages, eq(productImages.productId, products.id))
    .where(and(eq(products.artisanProfileId, chosenId), eq(products.status, 'published')))
    .orderBy(desc(products.createdAt), asc(productImages.position))
    .limit(1);

  // Eligibility guarantees a piece; if a race unpublished it between the two
  // queries, degrade to the legitimate no-photo state (null is a valid return
  // of this function) rather than throwing on an auth page.
  if (!piece) return null;

  return piece;
}
