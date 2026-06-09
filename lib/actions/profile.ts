'use server';

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { profileUpdateSchema } from '@/lib/validators/buyer';
import { composeName } from '@/lib/name';
import {
  sanitizeImage,
  IMAGE_FORMAT_META,
  MAX_IMAGE_DIMENSION,
} from '@/lib/storage/sanitize-image';

const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4 MB — avatars don't need banner-size budget

async function bestEffortUnlinkLocalUpload(url: string | null) {
  if (!url || !url.startsWith('/uploads/users/')) return;
  const filePath = path.join(process.cwd(), 'public', url.replace(/^\//, ''));
  try {
    await fs.unlink(filePath);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
}

export async function updateProfileAction(formData: FormData): Promise<Result<null>> {
  const log = await getRequestLogger();
  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  const parsed = profileUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }

  await db
    .update(user)
    .set({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName || null,
      name: composeName(parsed.data.firstName, parsed.data.lastName),
      updatedAt: new Date(),
    })
    .where(eq(user.id, current.id));

  log.info({ userId: current.id }, 'Profile updated');
  revalidatePath('/account');
  return ok(null);
}

export async function uploadAvatarAction(formData: FormData): Promise<Result<null>> {
  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  const file = formData.get('avatar');
  if (!(file instanceof File) || file.size === 0) {
    return err('Select an image to upload.');
  }
  if (file.size > MAX_AVATAR_BYTES) {
    return err('Avatar must be 4 MB or smaller.');
  }

  const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'users', current.id);
  await fs.mkdir(uploadDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const sanitized = await sanitizeImage(buffer, {
    maxBytes: MAX_AVATAR_BYTES,
    maxDimension: MAX_IMAGE_DIMENSION,
    allowedFormats: ['jpeg', 'png', 'webp'],
  });
  if (!sanitized.ok) return err(sanitized.error);

  const ext = IMAGE_FORMAT_META[sanitized.data.format].ext;
  const filename = `avatar-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(uploadDir, filename), sanitized.data.data);

  const newUrl = `/uploads/users/${current.id}/${filename}`;
  // Read the previous URL straight from the row — the in-memory user from
  // the session has whatever Better Auth cached, which can lag a write.
  const [row] = await db
    .select({ image: user.image })
    .from(user)
    .where(eq(user.id, current.id))
    .limit(1);
  await bestEffortUnlinkLocalUpload(row?.image ?? null);

  await db
    .update(user)
    .set({ image: newUrl, updatedAt: new Date() })
    .where(eq(user.id, current.id));

  revalidatePath('/account');
  return ok(null);
}

export async function deleteAvatarAction(): Promise<Result<null>> {
  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  const [row] = await db
    .select({ image: user.image })
    .from(user)
    .where(eq(user.id, current.id))
    .limit(1);
  if (!row?.image) return ok(null);

  await bestEffortUnlinkLocalUpload(row.image);

  await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, current.id));

  revalidatePath('/account');
  return ok(null);
}
