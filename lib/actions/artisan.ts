'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, catalogs } from '@/db/schema';
import { slugify, uniqueSlug } from '@/lib/slug';
import { getCurrentArtisanProfile, getCurrentUser } from '@/lib/auth-helpers';

export type BecomeArtisanResult = { error: string } | { ok: true };
export type UpdateArtisanResult = { error: string } | { ok: true };

export async function becomeArtisanAction(formData: FormData): Promise<BecomeArtisanResult> {
  const user = await getCurrentUser();
  if (!user) return { error: 'You must be signed in.' };

  const raw = formData.get('shopName');
  if (typeof raw !== 'string') return { error: 'Shop name is required.' };
  const shopName = raw.trim();
  if (shopName.length < 2 || shopName.length > 80) {
    return { error: 'Shop name must be between 2 and 80 characters.' };
  }

  const baseSlug = slugify(shopName);
  if (!baseSlug) return { error: 'Shop name must contain at least one letter or number.' };

  // Idempotency: if the user already has a profile, treat as success.
  const [existing] = await db
    .select()
    .from(artisanProfiles)
    .where(eq(artisanProfiles.userId, user.id))
    .limit(1);
  if (existing) {
    revalidatePath('/dashboard');
    return { ok: true };
  }

  // Resolve a unique shop slug. shop_slug is globally unique (small table for
  // a prototype; revisit if the artisan count ever grows large).
  const taken = await db.select({ slug: artisanProfiles.shopSlug }).from(artisanProfiles);
  const shopSlug = uniqueSlug(shopName, new Set(taken.map((r) => r.slug)));

  await db.transaction(async (tx) => {
    const [profile] = await tx
      .insert(artisanProfiles)
      .values({ userId: user.id, shopName, shopSlug })
      .returning();
    if (!profile) throw new Error('Failed to create artisan profile.');

    await tx.insert(catalogs).values({
      artisanProfileId: profile.id,
      slug: 'shop',
      title: 'Shop',
      status: 'draft',
    });
  });

  revalidatePath('/dashboard');
  return { ok: true };
}

export async function updateArtisanProfileAction(formData: FormData): Promise<UpdateArtisanResult> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return { error: 'No artisan profile to update.' };

  const shopNameRaw = formData.get('shopName');
  if (typeof shopNameRaw !== 'string') return { error: 'Shop name is required.' };
  const shopName = shopNameRaw.trim();
  if (shopName.length < 2 || shopName.length > 80) {
    return { error: 'Shop name must be between 2 and 80 characters.' };
  }

  const bio = (formData.get('bio') as string | null)?.trim() || null;
  const location = (formData.get('location') as string | null)?.trim() || null;
  const policies = (formData.get('policies') as string | null)?.trim() || null;
  const bannerImageUrl = (formData.get('bannerImageUrl') as string | null)?.trim() || null;

  await db
    .update(artisanProfiles)
    .set({
      shopName,
      bio,
      location,
      policies,
      bannerImageUrl,
      updatedAt: new Date(),
    })
    .where(eq(artisanProfiles.id, profile.id));

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
  revalidatePath(`/shop/${profile.shopSlug}`);

  return { ok: true };
}
