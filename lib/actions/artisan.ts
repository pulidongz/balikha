'use server';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, catalogs } from '@/db/schema';
import { uniqueSlug } from '@/lib/slug';
import { assertVerifiedEmail, getCurrentArtisanProfile, getCurrentUser } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { withIdempotency } from '@/lib/idempotency';
import { artisanProfileCreateSchema, artisanProfileUpdateSchema } from '@/lib/validators/artisan';

const ALLOWED_BANNER_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BANNER_BYTES = 8 * 1024 * 1024; // 8 MB — banners are larger than product images

async function bestEffortUnlinkLocalUpload(url: string | null) {
  if (!url || !url.startsWith('/uploads/artisans/')) return;
  const filePath = path.join(process.cwd(), 'public', url.replace(/^\//, ''));
  try {
    await fs.unlink(filePath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

export async function becomeArtisanAction(
  formData: FormData,
): Promise<Result<{ shopSlug: string; firstCatalogSlug: string | null }>> {
  const log = await getRequestLogger();
  const user = await getCurrentUser();
  if (!user) return err('You must be signed in.');

  const verified = assertVerifiedEmail(user);
  if (!verified.ok) return err(verified.error);

  const parsed = artisanProfileCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    log.warn(
      { userId: user.id, errors: parsed.error.flatten().fieldErrors },
      'becomeArtisan validation failed',
    );
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }
  const { shopName, idempotencyKey } = parsed.data;

  return withIdempotency({
    key: idempotencyKey,
    scope: 'becomeArtisan',
    userId: user.id,
    fn: async () => {
      // If the user already has a profile, treat the request as success
      // (covers double-clicks across page reloads where idempotencyKey
      // changed but the desired end-state was already achieved).
      const [existing] = await db
        .select({ id: artisanProfiles.id, shopSlug: artisanProfiles.shopSlug })
        .from(artisanProfiles)
        .where(eq(artisanProfiles.userId, user.id))
        .limit(1);
      if (existing) {
        // A returning seller can have zero catalogs (catalogs are deletable);
        // null explicitly represents that case so the caller can route to
        // the dashboard instead of a product form.
        const [firstCatalog] = await db
          .select({ slug: catalogs.slug })
          .from(catalogs)
          .where(eq(catalogs.artisanProfileId, existing.id))
          .orderBy(asc(catalogs.createdAt))
          .limit(1);
        revalidatePath('/dashboard');
        return ok({ shopSlug: existing.shopSlug, firstCatalogSlug: firstCatalog?.slug ?? null });
      }

      // Resolve a unique shop slug — globally unique, probes per candidate.
      const shopSlug = await uniqueSlug(shopName, async (candidate) => {
        const [row] = await db
          .select({ id: artisanProfiles.id })
          .from(artisanProfiles)
          .where(eq(artisanProfiles.shopSlug, candidate))
          .limit(1);
        return Boolean(row);
      });

      const firstCatalogSlug = await db.transaction(async (tx) => {
        const [profile] = await tx
          .insert(artisanProfiles)
          .values({ userId: user.id, shopName, shopSlug })
          .returning();
        if (!profile) throw new Error('Failed to create artisan profile.');

        const [catalog] = await tx
          .insert(catalogs)
          .values({
            artisanProfileId: profile.id,
            slug: 'shop',
            title: 'Shop',
            status: 'draft',
          })
          .returning({ slug: catalogs.slug });
        if (!catalog) throw new Error('Failed to create default catalog.');
        return catalog.slug;
      });

      log.info({ userId: user.id, shopSlug }, 'Artisan profile created');
      revalidatePath('/dashboard');
      return ok({ shopSlug, firstCatalogSlug });
    },
  });
}

export async function updateArtisanProfileAction(formData: FormData): Promise<Result<null>> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('No artisan profile to update.');

  const parsed = artisanProfileUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }

  await db
    .update(artisanProfiles)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(artisanProfiles.id, profile.id));

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
  revalidatePath(`/shop/${profile.shopSlug}`);
  return ok(null);
}

export async function uploadArtisanBannerAction(formData: FormData): Promise<Result<null>> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('No artisan profile to update.');

  const file = formData.get('banner');
  if (!(file instanceof File) || file.size === 0) {
    return err('Select an image to upload.');
  }
  if (!ALLOWED_BANNER_TYPES.has(file.type)) {
    return err(`Unsupported image type: ${file.type || 'unknown'}.`);
  }
  if (file.size > MAX_BANNER_BYTES) {
    return err('Banner must be 8 MB or smaller.');
  }

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'artisans', profile.id);
  await fs.mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = path.extname(file.name) || '.bin';
  const filename = `banner-${Date.now()}${ext.toLowerCase()}`;
  await fs.writeFile(path.join(uploadDir, filename), buffer);

  const newUrl = `/uploads/artisans/${profile.id}/${filename}`;
  await bestEffortUnlinkLocalUpload(profile.bannerImageUrl);

  await db
    .update(artisanProfiles)
    .set({ bannerImageUrl: newUrl, updatedAt: new Date() })
    .where(eq(artisanProfiles.id, profile.id));

  revalidatePath('/dashboard/settings');
  revalidatePath(`/shop/${profile.shopSlug}`);
  return ok(null);
}

export async function deleteArtisanBannerAction(): Promise<Result<null>> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('No artisan profile to update.');

  if (!profile.bannerImageUrl) return ok(null);

  await bestEffortUnlinkLocalUpload(profile.bannerImageUrl);

  await db
    .update(artisanProfiles)
    .set({ bannerImageUrl: null, updatedAt: new Date() })
    .where(eq(artisanProfiles.id, profile.id));

  revalidatePath('/dashboard/settings');
  revalidatePath(`/shop/${profile.shopSlug}`);
  return ok(null);
}
