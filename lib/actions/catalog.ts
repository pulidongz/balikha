'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs } from '@/db/schema';
import { uniqueSlug } from '@/lib/slug';
import { requireOwnership, tryRequireArtisan } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import {
  catalogCreateSchema,
  catalogStatusSchema,
  catalogUpdateSchema,
  type CatalogStatus,
} from '@/lib/validators/catalog';

export async function createCatalogAction(formData: FormData): Promise<Result<{ slug: string }>> {
  const profile = await tryRequireArtisan();
  if (!profile) return err('You must have an artisan profile.');

  const parsed = catalogCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }
  const { title, description } = parsed.data;

  // Catalog slugs are unique per artisan (composite index). exists() probes
  // by (artisan_profile_id, slug) so the lookup uses the unique index.
  const slug = await uniqueSlug(title, async (candidate) => {
    const [row] = await db
      .select({ id: catalogs.id })
      .from(catalogs)
      .where(and(eq(catalogs.artisanProfileId, profile.id), eq(catalogs.slug, candidate)))
      .limit(1);
    return Boolean(row);
  });

  await db.insert(catalogs).values({
    artisanProfileId: profile.id,
    slug,
    title,
    description: description ?? null,
    status: 'draft',
  });

  revalidatePath('/dashboard/catalogs');
  return ok({ slug });
}

export async function updateCatalogAction(
  catalogId: string,
  formData: FormData,
): Promise<Result<null>> {
  const profile = await tryRequireArtisan();
  if (!profile) return err('You must have an artisan profile.');

  // Load + ownership check, fetching only what's needed for the response.
  const [catalog] = await db
    .select({
      id: catalogs.id,
      artisanProfileId: catalogs.artisanProfileId,
    })
    .from(catalogs)
    .where(eq(catalogs.id, catalogId))
    .limit(1);
  try {
    requireOwnership(catalog, profile.id);
  } catch {
    return err('You do not own this catalog.');
  }

  const parsed = catalogUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }
  const { title, description, releaseAt, closesAt, isLimitedEdition } = parsed.data;

  await db
    .update(catalogs)
    .set({
      title,
      description: description ?? null,
      releaseAt: releaseAt ?? null,
      closesAt: closesAt ?? null,
      isLimitedEdition,
      updatedAt: new Date(),
    })
    .where(eq(catalogs.id, catalogId));

  revalidatePath('/dashboard/catalogs');
  return ok(null);
}

export async function setCatalogStatusAction(
  catalogId: string,
  status: CatalogStatus,
): Promise<Result<null>> {
  const profile = await tryRequireArtisan();
  if (!profile) return err('You must have an artisan profile.');

  const parsedStatus = catalogStatusSchema.safeParse(status);
  if (!parsedStatus.success) return err('Invalid status.');

  // Single UPDATE constrained by both id AND ownership — saves a load
  // round-trip for this hot path. rowCount=0 means either the catalog
  // doesn't exist or the current artisan doesn't own it; either way the
  // user-facing message is the same.
  const result = await db
    .update(catalogs)
    .set({ status: parsedStatus.data, updatedAt: new Date() })
    .where(and(eq(catalogs.id, catalogId), eq(catalogs.artisanProfileId, profile.id)));

  if ((result as { rowCount?: number }).rowCount === 0) {
    return err('Catalog not found or not owned.');
  }

  revalidatePath('/dashboard/catalogs');
  return ok(null);
}
