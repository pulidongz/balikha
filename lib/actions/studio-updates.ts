'use server';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { studioUpdateImages, studioUpdates } from '@/db/schema';
import { getCurrentArtisanProfile } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { studioPath } from '@/lib/routes';
import { getRequestLogger } from '@/lib/logger-context';
import {
  sanitizeImage,
  IMAGE_FORMAT_META,
  MAX_IMAGE_DIMENSION,
} from '@/lib/storage/sanitize-image';

const MAX_UPDATE_PHOTOS = 4;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // matches the banner ceiling
const MAX_BODY_LENGTH = 1000;

const bodySchema = z.string().trim().max(MAX_BODY_LENGTH);

async function bestEffortUnlinkUpdateImage(url: string) {
  if (!url.startsWith('/uploads/updates/')) return;
  const filePath = path.join(process.cwd(), 'public', url.replace(/^\//, ''));
  try {
    await fs.unlink(filePath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

// FormData (not JSON) because photos ride along — the whole post is one
// submit so an artist can publish from a phone in under a minute (T9 AC).
export async function createStudioUpdateAction(
  formData: FormData,
): Promise<Result<{ updateId: string }>> {
  const log = await getRequestLogger();

  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('Only studios can post updates.');

  const parsedBody = bodySchema.safeParse(formData.get('body') ?? '');
  if (!parsedBody.success) return err(`Keep it under ${MAX_BODY_LENGTH} characters.`);
  const body = parsedBody.data;

  const files = formData.getAll('photos').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return err('Add at least one photo.');
  if (files.length > MAX_UPDATE_PHOTOS) return err(`Up to ${MAX_UPDATE_PHOTOS} photos per update.`);
  for (const f of files) {
    if (f.size > MAX_PHOTO_BYTES) return err('Each photo must be 8 MB or smaller.');
  }

  // Sanitize everything BEFORE writing any file or row — a bad third
  // photo shouldn't leave a half-published update behind.
  const sanitizedAll = [];
  for (const f of files) {
    const sanitized = await sanitizeImage(Buffer.from(await f.arrayBuffer()), {
      maxBytes: MAX_PHOTO_BYTES,
      maxDimension: MAX_IMAGE_DIMENSION,
      allowedFormats: ['jpeg', 'png', 'webp'],
    });
    if (!sanitized.ok) return err(sanitized.error);
    sanitizedAll.push(sanitized.data);
  }

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'updates', profile.id);
  await fs.mkdir(uploadDir, { recursive: true });

  const urls: string[] = [];
  for (const [i, img] of sanitizedAll.entries()) {
    const filename = `update-${Date.now()}-${i}.${IMAGE_FORMAT_META[img.format].ext}`;
    await fs.writeFile(path.join(uploadDir, filename), img.data);
    urls.push(`/uploads/updates/${profile.id}/${filename}`);
  }

  const updateId = await db.transaction(async (tx) => {
    const [update] = await tx
      .insert(studioUpdates)
      .values({ artisanProfileId: profile.id, body })
      .returning({ id: studioUpdates.id });
    if (!update) throw new Error('Failed to create studio update');
    await tx
      .insert(studioUpdateImages)
      .values(urls.map((url, position) => ({ updateId: update.id, url, position })));
    return update.id;
  });

  log.info({ artisanProfileId: profile.id, updateId, photos: urls.length }, 'Studio update posted');
  revalidatePath(studioPath(profile.shopSlug));
  revalidatePath('/');
  return ok({ updateId });
}

export async function editStudioUpdateAction(input: unknown): Promise<Result<null>> {
  const log = await getRequestLogger();

  const parsed = z.object({ updateId: z.string().uuid(), body: bodySchema }).safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('Only studios can edit updates.');

  const [updated] = await db
    .update(studioUpdates)
    .set({ body: parsed.data.body, updatedAt: new Date() })
    .where(
      and(
        eq(studioUpdates.id, parsed.data.updateId),
        eq(studioUpdates.artisanProfileId, profile.id),
      ),
    )
    .returning({ id: studioUpdates.id });
  if (!updated) return err('Update not found.');

  log.info({ artisanProfileId: profile.id, updateId: updated.id }, 'Studio update edited');
  revalidatePath(studioPath(profile.shopSlug));
  revalidatePath('/');
  return ok(null);
}

export async function deleteStudioUpdateAction(input: unknown): Promise<Result<null>> {
  const log = await getRequestLogger();

  const parsed = z.object({ updateId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const profile = await getCurrentArtisanProfile();
  if (!profile) return err('Only studios can delete updates.');

  // Capture image URLs before the cascade wipes the rows.
  const images = await db
    .select({ url: studioUpdateImages.url })
    .from(studioUpdateImages)
    .where(eq(studioUpdateImages.updateId, parsed.data.updateId));

  const [deleted] = await db
    .delete(studioUpdates)
    .where(
      and(
        eq(studioUpdates.id, parsed.data.updateId),
        eq(studioUpdates.artisanProfileId, profile.id),
      ),
    )
    .returning({ id: studioUpdates.id });
  if (!deleted) return err('Update not found.');

  for (const img of images) await bestEffortUnlinkUpdateImage(img.url);

  log.info({ artisanProfileId: profile.id, updateId: deleted.id }, 'Studio update deleted');
  revalidatePath(studioPath(profile.shopSlug));
  revalidatePath('/');
  return ok(null);
}
