'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs, productImages, products } from '@/db/schema';
import { uniqueSlug } from '@/lib/slug';
import { requireArtisan, requireOwnership } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { deleteObject } from '@/lib/storage/delete';
import {
  productCreateSchema,
  productStatusSchema,
  productUpdateSchema,
  type ProductStatus,
} from '@/lib/validators/product';

// Build the structured input object the schema expects, from a FormData
// whose fields are flat strings. Materials becomes an array; dimensions
// becomes a nested object. Empty fields drop to undefined so schema defaults
// or .optional() behavior kick in.
function inputFromFormData(formData: FormData) {
  const get = (k: string): string | undefined => {
    const v = formData.get(k);
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
  };

  const materialsRaw = get('materials');
  const materials = materialsRaw
    ? materialsRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : undefined;

  const w = get('width');
  const h = get('height');
  const d = get('depth');
  const u = get('unit');
  const dims =
    w || h || d || u
      ? {
          width: w,
          height: h,
          depth: d,
          unit: u,
        }
      : undefined;

  return {
    title: get('title'),
    description: get('description'),
    price: get('price'),
    currency: get('currency'),
    stockOnHand: get('stockOnHand'),
    weightGrams: get('weightGrams'),
    materials,
    dimensions: dims,
  };
}

export async function createProductAction(
  catalogId: string,
  formData: FormData,
): Promise<Result<{ slug: string }>> {
  const profile = await requireArtisan().catch(() => null);
  if (!profile) return err('You must have an artisan profile.');

  // Verify catalog ownership before doing anything expensive.
  const [catalog] = await db
    .select({ id: catalogs.id, artisanProfileId: catalogs.artisanProfileId })
    .from(catalogs)
    .where(eq(catalogs.id, catalogId))
    .limit(1);
  try {
    requireOwnership(catalog, profile.id);
  } catch {
    return err('You do not own this catalog.');
  }

  const parsed = productCreateSchema.safeParse({ catalogId, ...inputFromFormData(formData) });
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }
  const { title, description, price, currency, stockOnHand, weightGrams, materials, dimensions } =
    parsed.data;

  // Slug must be unique within the artisan, not the catalog
  const taken = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.artisanProfileId, profile.id));
  const slug = uniqueSlug(title, new Set(taken.map((r) => r.slug)));

  await db.insert(products).values({
    catalogId,
    artisanProfileId: profile.id,
    slug,
    title,
    description: description ?? null,
    price,
    currency,
    stockOnHand,
    status: 'draft',
    dimensions: dimensions ?? null,
    materials: materials ?? null,
    weightGrams: weightGrams ?? null,
  });

  revalidatePath('/dashboard/catalogs');
  return ok({ slug });
}

export async function updateProductAction(
  productId: string,
  formData: FormData,
): Promise<Result<null>> {
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

  const parsed = productUpdateSchema.safeParse(inputFromFormData(formData));
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }
  const { title, description, price, currency, stockOnHand, weightGrams, materials, dimensions } =
    parsed.data;

  await db
    .update(products)
    .set({
      title,
      description: description ?? null,
      price,
      currency,
      stockOnHand,
      dimensions: dimensions ?? null,
      materials: materials ?? null,
      weightGrams: weightGrams ?? null,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  revalidatePath('/dashboard/catalogs');
  return ok(null);
}

export async function setProductStatusAction(
  productId: string,
  status: ProductStatus,
): Promise<Result<null>> {
  const profile = await requireArtisan().catch(() => null);
  if (!profile) return err('You must have an artisan profile.');

  const parsedStatus = productStatusSchema.safeParse(status);
  if (!parsedStatus.success) return err('Invalid status.');

  // Single UPDATE constrained by id + ownership — IDOR-safe in one query.
  const result = await db
    .update(products)
    .set({ status: parsedStatus.data, updatedAt: new Date() })
    .where(and(eq(products.id, productId), eq(products.artisanProfileId, profile.id)));

  if ((result as { rowCount?: number }).rowCount === 0) {
    return err('Product not found or not owned.');
  }

  revalidatePath('/dashboard/catalogs');
  return ok(null);
}

export async function deleteProductImageAction(imageId: string): Promise<Result<null>> {
  const profile = await requireArtisan().catch(() => null);
  if (!profile) return err('You must have an artisan profile.');

  // Image ownership comes via JOIN to the parent product. Also fetch
  // storageKey so we can delete the underlying object after the row is gone.
  const [imageRow] = await db
    .select({
      id: productImages.id,
      storageKey: productImages.storageKey,
      artisanProfileId: products.artisanProfileId,
    })
    .from(productImages)
    .innerJoin(products, eq(products.id, productImages.productId))
    .where(eq(productImages.id, imageId))
    .limit(1);
  try {
    requireOwnership(imageRow, profile.id);
  } catch {
    return err('You do not own this image.');
  }

  await db.delete(productImages).where(eq(productImages.id, imageId));

  // S3 cleanup is best-effort and only applies to images we own in our
  // bucket. External URLs (seeded placeholders, future hot-linked imports)
  // have storageKey=null and we leave them alone — not ours to delete.
  if (imageRow?.storageKey) {
    await deleteObject(imageRow.storageKey);
  }

  revalidatePath('/dashboard/catalogs');
  return ok(null);
}
