'use server';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { imageSize } from 'image-size';
import { db } from '@/db';
import { productImages, products } from '@/db/schema';
import { slugify, uniqueSlug } from '@/lib/slug';
import { assertOwnsCatalog, assertOwnsProduct, assertOwnsProductImage } from '@/lib/ownership';

export type ActionResult = { error: string } | { ok: true };

const PRICE_RE = /^\d+(\.\d{1,2})?$/;
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

function parseMaterials(raw: FormDataEntryValue | null): string[] | null {
  if (typeof raw !== 'string') return null;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length === 0 ? null : list;
}

function parseDimensions(formData: FormData) {
  const w = formData.get('width');
  const h = formData.get('height');
  const d = formData.get('depth');
  const u = formData.get('unit');
  const dims: { width?: number; height?: number; depth?: number; unit?: 'cm' | 'in' } = {};
  if (typeof w === 'string' && w !== '') dims.width = Number(w);
  if (typeof h === 'string' && h !== '') dims.height = Number(h);
  if (typeof d === 'string' && d !== '') dims.depth = Number(d);
  if (u === 'cm' || u === 'in') dims.unit = u;
  return Object.keys(dims).length === 0 ? null : dims;
}

export async function createProductAction(
  catalogId: string,
  formData: FormData,
): Promise<ActionResult> {
  const profile = await assertOwnsCatalog(catalogId);

  const titleRaw = formData.get('title');
  if (typeof titleRaw !== 'string') return { error: 'Title is required.' };
  const title = titleRaw.trim();
  if (title.length < 2 || title.length > 200) {
    return { error: 'Title must be between 2 and 200 characters.' };
  }

  const baseSlug = slugify(title);
  if (!baseSlug) return { error: 'Title must contain at least one letter or number.' };

  const priceRaw = formData.get('price');
  if (typeof priceRaw !== 'string' || !PRICE_RE.test(priceRaw)) {
    return { error: 'Price must be a positive number with up to 2 decimal places.' };
  }

  const description = (formData.get('description') as string | null)?.trim() || null;
  const currency = (formData.get('currency') as string | null)?.trim() || 'PHP';
  const stockRaw = formData.get('stockOnHand');
  const stockOnHand = typeof stockRaw === 'string' && stockRaw !== '' ? Number(stockRaw) : 0;
  if (!Number.isInteger(stockOnHand) || stockOnHand < 0) {
    return { error: 'Stock must be a non-negative integer.' };
  }
  const weightRaw = formData.get('weightGrams');
  let weightGrams: number | null = null;
  if (typeof weightRaw === 'string' && weightRaw !== '') {
    const n = Number(weightRaw);
    if (!Number.isInteger(n) || n < 0) return { error: 'Weight must be a non-negative integer.' };
    weightGrams = n;
  }

  const materials = parseMaterials(formData.get('materials'));
  const dimensions = parseDimensions(formData);

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
    description,
    price: priceRaw,
    currency,
    stockOnHand,
    status: 'draft',
    dimensions,
    materials,
    weightGrams,
  });

  revalidatePath('/dashboard/catalogs');
  return { ok: true };
}

export async function updateProductAction(
  productId: string,
  formData: FormData,
): Promise<ActionResult> {
  await assertOwnsProduct(productId);

  const titleRaw = formData.get('title');
  if (typeof titleRaw !== 'string') return { error: 'Title is required.' };
  const title = titleRaw.trim();
  if (title.length < 2 || title.length > 200) {
    return { error: 'Title must be between 2 and 200 characters.' };
  }

  const priceRaw = formData.get('price');
  if (typeof priceRaw !== 'string' || !PRICE_RE.test(priceRaw)) {
    return { error: 'Price must be a positive number with up to 2 decimal places.' };
  }

  const description = (formData.get('description') as string | null)?.trim() || null;
  const currency = (formData.get('currency') as string | null)?.trim() || 'PHP';
  const stockRaw = formData.get('stockOnHand');
  const stockOnHand = typeof stockRaw === 'string' && stockRaw !== '' ? Number(stockRaw) : 0;
  if (!Number.isInteger(stockOnHand) || stockOnHand < 0) {
    return { error: 'Stock must be a non-negative integer.' };
  }
  const weightRaw = formData.get('weightGrams');
  let weightGrams: number | null = null;
  if (typeof weightRaw === 'string' && weightRaw !== '') {
    const n = Number(weightRaw);
    if (!Number.isInteger(n) || n < 0) return { error: 'Weight must be a non-negative integer.' };
    weightGrams = n;
  }

  const materials = parseMaterials(formData.get('materials'));
  const dimensions = parseDimensions(formData);

  await db
    .update(products)
    .set({
      title,
      description,
      price: priceRaw,
      currency,
      stockOnHand,
      dimensions,
      materials,
      weightGrams,
      updatedAt: new Date(),
    })
    .where(eq(products.id, productId));

  revalidatePath('/dashboard/catalogs');
  return { ok: true };
}

export async function setProductStatusAction(
  productId: string,
  status: 'draft' | 'published' | 'sold_out' | 'archived',
): Promise<ActionResult> {
  await assertOwnsProduct(productId);

  await db
    .update(products)
    .set({ status, updatedAt: new Date() })
    .where(eq(products.id, productId));

  revalidatePath('/dashboard/catalogs');
  return { ok: true };
}

export async function uploadProductImagesAction(
  productId: string,
  formData: FormData,
): Promise<ActionResult> {
  const { profile } = await assertOwnsProduct(productId);

  const files = formData
    .getAll('images')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) return { error: 'Select at least one image.' };

  for (const file of files) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      return { error: `Unsupported image type: ${file.type || 'unknown'}.` };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: `${file.name} exceeds 10 MB.` };
    }
  }

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', profile.id, productId);
  await fs.mkdir(uploadDir, { recursive: true });

  // Find current max position so new images append
  const existing = await db
    .select({ position: productImages.position })
    .from(productImages)
    .where(eq(productImages.productId, productId));
  let nextPosition = existing.reduce((max, r) => Math.max(max, r.position + 1), 0);

  for (const file of files) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const dims = imageSize(buffer);

    const ext = path.extname(file.name) || '.bin';
    const safeBase = path
      .basename(file.name, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 60);
    const filename = `${Date.now()}-${safeBase}${ext.toLowerCase()}`;
    await fs.writeFile(path.join(uploadDir, filename), buffer);

    await db.insert(productImages).values({
      productId,
      url: `/uploads/${profile.id}/${productId}/${filename}`,
      altText: null,
      position: nextPosition,
      width: dims.width ?? null,
      height: dims.height ?? null,
    });
    nextPosition += 1;
  }

  revalidatePath('/dashboard/catalogs');
  return { ok: true };
}

export async function deleteProductImageAction(imageId: string): Promise<ActionResult> {
  await assertOwnsProductImage(imageId);

  // Fetch URL so we can unlink the file as well
  const [row] = await db
    .select({ url: productImages.url })
    .from(productImages)
    .where(eq(productImages.id, imageId))
    .limit(1);

  await db.delete(productImages).where(eq(productImages.id, imageId));

  if (row) {
    const filePath = path.join(process.cwd(), 'public', row.url.replace(/^\//, ''));
    // Best-effort filesystem cleanup. The DB row is already gone, so a missing
    // file (e.g. manually deleted, race with another action) shouldn't surface
    // as a user-visible error — but anything else we re-raise.
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  revalidatePath('/dashboard/catalogs');
  return { ok: true };
}
