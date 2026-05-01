import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs, products, productImages, type artisanProfiles } from '@/db/schema';
import { getCurrentArtisanProfile } from '@/lib/auth-helpers';
import type { InferSelectModel } from 'drizzle-orm';

type ArtisanProfile = InferSelectModel<typeof artisanProfiles>;

export class NotAuthorizedError extends Error {
  constructor(message = 'Not authorized') {
    super(message);
    this.name = 'NotAuthorizedError';
  }
}

async function requireProfile(): Promise<ArtisanProfile> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) throw new NotAuthorizedError('No artisan profile for current user.');
  return profile;
}

export async function assertOwnsCatalog(catalogId: string): Promise<ArtisanProfile> {
  const profile = await requireProfile();
  const [row] = await db
    .select({ artisanProfileId: catalogs.artisanProfileId })
    .from(catalogs)
    .where(eq(catalogs.id, catalogId))
    .limit(1);
  if (!row || row.artisanProfileId !== profile.id) {
    throw new NotAuthorizedError('You do not own this catalog.');
  }
  return profile;
}

export async function assertOwnsProduct(
  productId: string,
): Promise<{ profile: ArtisanProfile; catalogId: string }> {
  const profile = await requireProfile();
  const [row] = await db
    .select({
      artisanProfileId: products.artisanProfileId,
      catalogId: products.catalogId,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!row || row.artisanProfileId !== profile.id) {
    throw new NotAuthorizedError('You do not own this product.');
  }
  return { profile, catalogId: row.catalogId };
}

export async function assertOwnsProductImage(
  imageId: string,
): Promise<{ profile: ArtisanProfile; productId: string }> {
  const profile = await requireProfile();
  const [row] = await db
    .select({
      productId: productImages.productId,
      artisanProfileId: products.artisanProfileId,
    })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(eq(productImages.id, imageId))
    .limit(1);
  if (!row || row.artisanProfileId !== profile.id) {
    throw new NotAuthorizedError('You do not own this image.');
  }
  return { profile, productId: row.productId };
}
