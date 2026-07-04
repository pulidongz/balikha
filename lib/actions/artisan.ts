'use server';

import { revalidatePath } from 'next/cache';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, catalogs, products } from '@/db/schema';
import { uniqueSlug } from '@/lib/slug';
import {
  assertVerifiedEmail,
  getCurrentArtisanProfile,
  getCurrentUser,
  NOT_AUTHENTICATED_MESSAGE,
} from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { studioPath } from '@/lib/routes';
import { getRequestLogger } from '@/lib/logger-context';
import { withIdempotency } from '@/lib/idempotency';
import {
  artisanCoverFocusSchema,
  artisanProfileCreateSchema,
  artisanProfileUpdateSchema,
} from '@/lib/validators/artisan';
import { logAnalyticsEvent } from '@/lib/analytics/log';
import {
  sanitizeImage,
  IMAGE_FORMAT_META,
  MAX_IMAGE_DIMENSION,
} from '@/lib/storage/sanitize-image';
import { putObject } from '@/lib/storage/put-object';
import { buildArtisanAssetKey, publicUrlForKey } from '@/lib/storage/keys';
import { bestEffortDeleteStoredUpload } from '@/lib/storage/delete';

const MAX_BANNER_BYTES = 8 * 1024 * 1024; // 8 MB — banners are larger than product images

export async function becomeArtisanAction(
  formData: FormData,
): Promise<Result<{ shopSlug: string; firstCatalogSlug: string | null }>> {
  const log = await getRequestLogger();
  const user = await getCurrentUser();
  if (!user) return err(NOT_AUTHENTICATED_MESSAGE);

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

      const { profileId, firstCatalogSlug } = await db.transaction(async (tx) => {
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
        return { profileId: profile.id, firstCatalogSlug: catalog.slug };
      });

      log.info({ userId: user.id, shopSlug }, 'Artisan profile created');
      revalidatePath('/dashboard');
      await logAnalyticsEvent({
        type: 'seller_signup',
        userId: user.id,
        artisanProfileId: profileId,
        entityType: 'artisan',
        entityId: profileId,
      });
      return ok({ shopSlug, firstCatalogSlug });
    },
  });
}

// Build the validator input from FormData. Two different absences matter:
// a field NOT in the FormData (form doesn't edit it) stays `undefined` and
// drizzle skips it on update — so the settings form and the on-page studio
// dialog can share this action while editing different field sets. A field
// submitted EMPTY ('') becomes null — an explicit clear.
function profileInputFromFormData(formData: FormData) {
  const getRequired = (k: string): string | undefined => {
    const v = formData.get(k);
    return typeof v === 'string' ? v.trim() : undefined;
  };
  const getClearable = (k: string): string | null | undefined => {
    const v = formData.get(k);
    if (v === null) return undefined; // not submitted → leave unchanged
    const t = String(v).trim();
    return t === '' ? null : t;
  };
  const craftTagsRaw = formData.get('craftTags');
  const craftTags =
    craftTagsRaw === null
      ? undefined
      : String(craftTagsRaw)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  return {
    shopName: getRequired('shopName'),
    bio: getClearable('bio'),
    location: getClearable('location'),
    policies: getClearable('policies'),
    craftTags,
    instagram: getClearable('instagram'),
    facebook: getClearable('facebook'),
    tiktok: getClearable('tiktok'),
    website: getClearable('website'),
  };
}

export async function updateArtisanProfileAction(formData: FormData): Promise<Result<null>> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('No artisan profile to update.');

  // Verification can lapse after an email change; gate public-profile edits
  // on the current state (getCurrentArtisanProfile returns no emailVerified).
  const user = await getCurrentUser();
  if (!user) return err(NOT_AUTHENTICATED_MESSAGE);
  const verified = assertVerifiedEmail(user);
  if (!verified.ok) return err(verified.error);

  const input = profileInputFromFormData(formData);
  const parsed = artisanProfileUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }
  const { shopName, bio, location, policies, craftTags, instagram, facebook, tiktok, website } =
    parsed.data;

  // Assemble the externalLinks jsonb only when at least one link field was
  // actually submitted; otherwise leave the column untouched (undefined).
  const anyLinkSubmitted = [instagram, facebook, tiktok, website].some((v) => v !== undefined);
  const links = {
    ...(instagram ? { instagram } : {}),
    ...(facebook ? { facebook } : {}),
    ...(tiktok ? { tiktok } : {}),
    ...(website ? { website } : {}),
  };
  const externalLinks = anyLinkSubmitted
    ? Object.keys(links).length > 0
      ? links
      : null
    : undefined;

  await db
    .update(artisanProfiles)
    .set({
      shopName,
      bio,
      location,
      policies,
      craftTags: craftTags === undefined ? undefined : craftTags.length > 0 ? craftTags : null,
      externalLinks,
      updatedAt: new Date(),
    })
    .where(eq(artisanProfiles.id, profile.id));

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/settings');
  revalidatePath(studioPath(profile.shopSlug));
  return ok(null);
}

// Sets the cover image's vertical focal point (T2 "cover crop"). Pure
// framing metadata — no file is touched.
export async function setArtisanCoverFocusAction(focus: string): Promise<Result<null>> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('No artisan profile to update.');

  const parsed = artisanCoverFocusSchema.safeParse(focus);
  if (!parsed.success) return err('Invalid cover focus.');

  await db
    .update(artisanProfiles)
    .set({ coverFocus: parsed.data, updatedAt: new Date() })
    .where(eq(artisanProfiles.id, profile.id));

  revalidatePath(studioPath(profile.shopSlug));
  revalidatePath('/dashboard/settings');
  return ok(null);
}

// Pin (or unpin, with null) a featured work on the studio page (T2).
// Ownership is enforced in the WHERE of the product probe; only published
// works can be pinned — a visitor-facing slot must never hold hidden work.
export async function setFeaturedProductAction(productId: string | null): Promise<Result<null>> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('No artisan profile to update.');

  if (productId !== null) {
    const [product] = await db
      .select({ id: products.id, status: products.status })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.artisanProfileId, profile.id)))
      .limit(1);
    if (!product) return err('That work was not found in your studio.');
    if (product.status !== 'published') {
      return err('Only published works can be featured.');
    }
  }

  await db
    .update(artisanProfiles)
    .set({ featuredProductId: productId, updatedAt: new Date() })
    .where(eq(artisanProfiles.id, profile.id));

  revalidatePath(studioPath(profile.shopSlug));
  return ok(null);
}

const MAX_PROFILE_PHOTO_BYTES = 4 * 1024 * 1024; // 4 MB — avatar-sized asset

export async function uploadArtisanProfilePhotoAction(formData: FormData): Promise<Result<null>> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('No artisan profile to update.');

  const user = await getCurrentUser();
  if (!user) return err(NOT_AUTHENTICATED_MESSAGE);
  const verified = assertVerifiedEmail(user);
  if (!verified.ok) return err(verified.error);

  const file = formData.get('photo');
  if (!(file instanceof File) || file.size === 0) {
    return err('Select an image to upload.');
  }
  if (file.size > MAX_PROFILE_PHOTO_BYTES) {
    return err('Photo must be 4 MB or smaller.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sanitized = await sanitizeImage(buffer, {
    maxBytes: MAX_PROFILE_PHOTO_BYTES,
    maxDimension: MAX_IMAGE_DIMENSION,
    allowedFormats: ['jpeg', 'png', 'webp'],
  });
  if (!sanitized.ok) return err(sanitized.error);

  const meta = IMAGE_FORMAT_META[sanitized.data.format];
  const key = buildArtisanAssetKey(profile.id, 'profile-photo', meta.ext);
  await putObject({ key, body: sanitized.data.data, contentType: meta.contentType });

  const newUrl = publicUrlForKey(key);
  await bestEffortDeleteStoredUpload(profile.profilePhotoUrl);

  await db
    .update(artisanProfiles)
    .set({ profilePhotoUrl: newUrl, updatedAt: new Date() })
    .where(eq(artisanProfiles.id, profile.id));

  revalidatePath('/dashboard/settings');
  revalidatePath(studioPath(profile.shopSlug));
  return ok(null);
}

export async function deleteArtisanProfilePhotoAction(): Promise<Result<null>> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('No artisan profile to update.');

  if (!profile.profilePhotoUrl) return ok(null);

  await bestEffortDeleteStoredUpload(profile.profilePhotoUrl);

  await db
    .update(artisanProfiles)
    .set({ profilePhotoUrl: null, updatedAt: new Date() })
    .where(eq(artisanProfiles.id, profile.id));

  revalidatePath('/dashboard/settings');
  revalidatePath(studioPath(profile.shopSlug));
  return ok(null);
}

export async function uploadArtisanBannerAction(formData: FormData): Promise<Result<null>> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('No artisan profile to update.');

  const user = await getCurrentUser();
  if (!user) return err(NOT_AUTHENTICATED_MESSAGE);
  const verified = assertVerifiedEmail(user);
  if (!verified.ok) return err(verified.error);

  const file = formData.get('banner');
  if (!(file instanceof File) || file.size === 0) {
    return err('Select an image to upload.');
  }
  if (file.size > MAX_BANNER_BYTES) {
    return err('Banner must be 8 MB or smaller.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sanitized = await sanitizeImage(buffer, {
    maxBytes: MAX_BANNER_BYTES,
    maxDimension: MAX_IMAGE_DIMENSION,
    allowedFormats: ['jpeg', 'png', 'webp'],
  });
  if (!sanitized.ok) return err(sanitized.error);

  const meta = IMAGE_FORMAT_META[sanitized.data.format];
  const key = buildArtisanAssetKey(profile.id, 'banner', meta.ext);
  await putObject({ key, body: sanitized.data.data, contentType: meta.contentType });

  const newUrl = publicUrlForKey(key);
  await bestEffortDeleteStoredUpload(profile.bannerImageUrl);

  await db
    .update(artisanProfiles)
    .set({ bannerImageUrl: newUrl, updatedAt: new Date() })
    .where(eq(artisanProfiles.id, profile.id));

  revalidatePath('/dashboard/settings');
  revalidatePath(studioPath(profile.shopSlug));
  return ok(null);
}

export async function deleteArtisanBannerAction(): Promise<Result<null>> {
  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('No artisan profile to update.');

  if (!profile.bannerImageUrl) return ok(null);

  await bestEffortDeleteStoredUpload(profile.bannerImageUrl);

  await db
    .update(artisanProfiles)
    .set({ bannerImageUrl: null, updatedAt: new Date() })
    .where(eq(artisanProfiles.id, profile.id));

  revalidatePath('/dashboard/settings');
  revalidatePath(studioPath(profile.shopSlug));
  return ok(null);
}
