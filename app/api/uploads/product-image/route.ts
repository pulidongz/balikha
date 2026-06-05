import { NextResponse, type NextRequest } from 'next/server';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { productImages, products } from '@/db/schema';
import { ForbiddenError, UnauthorizedError, requireArtisan, requireUser } from '@/lib/auth-helpers';
import { logger } from '@/lib/logger';
import { buildProductImageKey, publicUrlForKey } from '@/lib/storage/keys';
import { putObject } from '@/lib/storage/put-object';
import {
  ALLOWED_IMAGE_FORMATS,
  IMAGE_FORMAT_META,
  MAX_IMAGE_DIMENSION,
  sanitizeImage,
} from '@/lib/storage/sanitize-image';
import { MAX_IMAGE_BYTES } from '@/lib/storage/upload-product-image';

// Server-proxied product-image upload. Replaces the old presign+confirm flow:
// the server now holds the bytes, validates the REAL content (magic-byte
// format detection), strips EXIF by re-encoding, then PutObjects the sanitized
// image and records the row. No client trust remains.
//
// A Route Handler (not a Server Action) because Server Actions cap the request
// body at ~1 MB by default; request.formData() here has no such cap.
//
// This endpoint is directly reachable (there is no middleware.ts), so it must
// enforce authz itself: requireUser() (banned check, defense-in-depth — mirrors
// lib/auth-helpers.ts:82-92), then requireArtisan(), then product ownership.
export async function POST(request: NextRequest) {
  // --- Auth, with distinct 401/403 codes ---
  let profile: Awaited<ReturnType<typeof requireArtisan>>;
  try {
    await requireUser();
    profile = await requireArtisan();
  } catch (e) {
    if (e instanceof UnauthorizedError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    if (e instanceof ForbiddenError) {
      // Banned user (from requireUser) or missing artisan profile
      // (from requireArtisan) — both are 403 once signed in.
      return NextResponse.json({ error: 'You must have an artisan profile.' }, { status: 403 });
    }
    throw e;
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const productId = formData.get('productId');
  const altTextRaw = formData.get('altText');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  if (typeof productId !== 'string' || productId.length === 0) {
    return NextResponse.json({ error: 'Missing product id.' }, { status: 400 });
  }
  const altText = typeof altTextRaw === 'string' && altTextRaw.length > 0 ? altTextRaw : null;

  // --- Product ownership ---
  const [product] = await db
    .select({ id: products.id, artisanProfileId: products.artisanProfileId })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product || product.artisanProfileId !== profile.id) {
    return NextResponse.json({ error: 'You do not own this product.' }, { status: 403 });
  }

  // --- Early size guard BEFORE buffering (DoS protection) ---
  // file.size is client-claimed but cheap; reject a multi-hundred-MB POST
  // without reading it into RAM. buffer.length in sanitizeImage is the
  // authoritative post-buffer cap.
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: 'Image must be 10 MB or smaller.' }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sanitized = await sanitizeImage(buffer, {
    maxBytes: MAX_IMAGE_BYTES,
    maxDimension: MAX_IMAGE_DIMENSION,
    allowedFormats: ALLOWED_IMAGE_FORMATS,
  });
  if (!sanitized.ok) {
    return NextResponse.json({ error: sanitized.error }, { status: 400 });
  }

  // --- Store --- server derives the key from the sanitized format, so no
  // client key is accepted (the old key-prefix guard is obsolete by
  // construction).
  const { data, format, contentType, width, height } = sanitized.data;
  const key = buildProductImageKey(productId, IMAGE_FORMAT_META[format].ext);
  await putObject({ key, body: data, contentType });

  // Append at the end of the existing image list.
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
      altText,
      position: nextPosition,
      width,
      height,
    })
    .returning({ id: productImages.id });
  if (!created) {
    return NextResponse.json({ error: 'Failed to record image.' }, { status: 500 });
  }

  logger.info(
    {
      artisanId: profile.id,
      productId,
      imageId: created.id,
      key,
      bytesIn: buffer.length,
      bytesOut: data.length,
      format,
    },
    'Product image uploaded',
  );
  revalidatePath('/dashboard/catalogs');
  return NextResponse.json({ imageId: created.id });
}
