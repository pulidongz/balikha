'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { catalogs } from '@/db/schema';
import { slugify, uniqueSlug } from '@/lib/slug';
import { getCurrentArtisanProfile } from '@/lib/auth-helpers';
import { assertOwnsCatalog } from '@/lib/ownership';

export type ActionResult = { error: string } | { ok: true };

function parseTimestamp(value: FormDataEntryValue | null): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function createCatalogAction(formData: FormData): Promise<ActionResult> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return { error: 'You must have an artisan profile.' };

  const titleRaw = formData.get('title');
  if (typeof titleRaw !== 'string') return { error: 'Title is required.' };
  const title = titleRaw.trim();
  if (title.length < 2 || title.length > 120) {
    return { error: 'Title must be between 2 and 120 characters.' };
  }

  const baseSlug = slugify(title);
  if (!baseSlug) return { error: 'Title must contain at least one letter or number.' };

  const description = (formData.get('description') as string | null)?.trim() || null;

  const taken = await db
    .select({ slug: catalogs.slug })
    .from(catalogs)
    .where(eq(catalogs.artisanProfileId, profile.id));
  const slug = uniqueSlug(title, new Set(taken.map((r) => r.slug)));

  await db.insert(catalogs).values({
    artisanProfileId: profile.id,
    slug,
    title,
    description,
    status: 'draft',
  });

  revalidatePath('/dashboard/catalogs');
  return { ok: true };
}

export async function updateCatalogAction(
  catalogId: string,
  formData: FormData,
): Promise<ActionResult> {
  await assertOwnsCatalog(catalogId);

  const titleRaw = formData.get('title');
  if (typeof titleRaw !== 'string') return { error: 'Title is required.' };
  const title = titleRaw.trim();
  if (title.length < 2 || title.length > 120) {
    return { error: 'Title must be between 2 and 120 characters.' };
  }

  const description = (formData.get('description') as string | null)?.trim() || null;
  const releaseAt = parseTimestamp(formData.get('releaseAt'));
  const closesAt = parseTimestamp(formData.get('closesAt'));

  await db
    .update(catalogs)
    .set({ title, description, releaseAt, closesAt, updatedAt: new Date() })
    .where(eq(catalogs.id, catalogId));

  revalidatePath('/dashboard/catalogs');
  return { ok: true };
}

export async function setCatalogStatusAction(
  catalogId: string,
  status: 'draft' | 'published' | 'archived',
): Promise<ActionResult> {
  await assertOwnsCatalog(catalogId);

  await db
    .update(catalogs)
    .set({ status, updatedAt: new Date() })
    .where(eq(catalogs.id, catalogId));

  revalidatePath('/dashboard/catalogs');
  return { ok: true };
}
