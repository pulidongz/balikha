'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { productImages, products } from '@/db/schema';
import { requireArtisan, requireOwnership } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { logger } from '@/lib/logger';
import { buildProductImageKey, publicUrlForKey } from '@/lib/storage/keys';
import { presignProductImageUpload } from '@/lib/storage/presign';
import { imageUploadConfirmSchema, imageUploadRequestSchema } from '@/lib/validators/product';

export async function requestImageUploadAction(
  input: unknown,
): Promise<Result<{ uploadUrl: string; key: string }>> {
  const parsed = imageUploadRequestSchema.safeParse(input);
  if (!parsed.success) {
    return err('Invalid upload request', parsed.error.flatten().fieldErrors);
  }
  const { productId, filename, contentType, sizeBytes } = parsed.data;

  const profile = await requireArtisan().catch(() => null);
  if (!profile) return err('You must have an artisan profile.');

  const [product] = await db
    .select({ id: products.id, artisanProfileId: products.artisanProfileId })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  try {
    requireOwnership(product, profile.id);
  } catch {
    return err('You do not own this product.');
  }

  const key = buildProductImageKey(productId, filename);
  const { url } = await presignProductImageUpload({ key, contentType, sizeBytes });

  logger.info({ artisanId: profile.id, productId, key, sizeBytes }, 'Presigned upload URL issued');

  return ok({ uploadUrl: url, key });
}

export async function confirmImageUploadAction(
  input: unknown,
): Promise<Result<{ imageId: string }>> {
  const parsed = imageUploadConfirmSchema.safeParse(input);
  if (!parsed.success) {
    return err('Invalid confirmation', parsed.error.flatten().fieldErrors);
  }
  const { productId, key, width, height, altText } = parsed.data;

  const profile = await requireArtisan().catch(() => null);
  if (!profile) return err('You must have an artisan profile.');

  // Verify product ownership AND that the submitted key was actually issued
  // for this product. The prefix check prevents a (signed-in) attacker from
  // calling confirm with someone else's storage key to register an image
  // under their own product.
  const expectedPrefix = `products/${productId}/`;
  if (!key.startsWith(expectedPrefix)) {
    logger.warn({ artisanId: profile.id, productId, key }, 'Key prefix mismatch on confirm');
    return err('Invalid storage key for this product.');
  }

  const [product] = await db
    .select({ id: products.id, artisanProfileId: products.artisanProfileId })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.artisanProfileId, profile.id)))
    .limit(1);
  if (!product) return err('Product not found or not owned.');

  // Append at the end of the existing image list
  const existing = await db
    .select({ position: productImages.position })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  const nextPosition = existing.reduce((max, r) => Math.max(max, r.position + 1), 0);

  const [created] = await db
    .insert(productImages)
    .values({
      productId,
      storageKey: key,
      url: publicUrlForKey(key),
      altText: altText ?? null,
      position: nextPosition,
      width,
      height,
    })
    .returning({ id: productImages.id });
  if (!created) return err('Failed to record image.');

  logger.info(
    { artisanId: profile.id, productId, imageId: created.id, key },
    'Image upload confirmed',
  );
  revalidatePath('/dashboard/catalogs');
  return ok({ imageId: created.id });
}
