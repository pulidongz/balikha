'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { auth } from '@/lib/auth';
import { getCurrentUser } from '@/lib/auth-helpers';
import { userHasPassword } from '@/lib/account/credentials';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { profileUpdateSchema } from '@/lib/validators/buyer';
import { setPasswordSchema } from '@/lib/validators/profile-security';
import { composeName } from '@/lib/name';
import {
  sanitizeImage,
  IMAGE_FORMAT_META,
  MAX_IMAGE_DIMENSION,
} from '@/lib/storage/sanitize-image';
import { putObject } from '@/lib/storage/put-object';
import { buildUserAvatarKey, publicUrlForKey } from '@/lib/storage/keys';
import { bestEffortDeleteStoredUpload } from '@/lib/storage/delete';

const MAX_AVATAR_BYTES = 4 * 1024 * 1024; // 4 MB — avatars don't need banner-size budget

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

  const buffer = Buffer.from(await file.arrayBuffer());
  const sanitized = await sanitizeImage(buffer, {
    maxBytes: MAX_AVATAR_BYTES,
    maxDimension: MAX_IMAGE_DIMENSION,
    allowedFormats: ['jpeg', 'png', 'webp'],
  });
  if (!sanitized.ok) return err(sanitized.error);

  const meta = IMAGE_FORMAT_META[sanitized.data.format];
  const key = buildUserAvatarKey(current.id, meta.ext);
  await putObject({ key, body: sanitized.data.data, contentType: meta.contentType });

  const newUrl = publicUrlForKey(key);
  // Read the previous URL straight from the row — the in-memory user from
  // the session has whatever Better Auth cached, which can lag a write.
  const [row] = await db
    .select({ image: user.image })
    .from(user)
    .where(eq(user.id, current.id))
    .limit(1);
  await bestEffortDeleteStoredUpload(row?.image ?? null);

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

  await bestEffortDeleteStoredUpload(row.image);

  await db.update(user).set({ image: null, updatedAt: new Date() }).where(eq(user.id, current.id));

  revalidatePath('/account');
  return ok(null);
}

// Sets a FIRST password for a user who has none (Google-only accounts). Email/
// password users change their password via authClient.changePassword on the
// client — setPassword is server-only and exists specifically for the
// no-password case. We check userHasPassword ourselves and return a precise
// error rather than letting Better Auth's PASSWORD_ALREADY_SET surface as an
// opaque message.
export async function setPasswordAction(formData: FormData): Promise<Result<null>> {
  const log = await getRequestLogger();
  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  const parsed = setPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }

  if (await userHasPassword(current.id)) {
    return err('You already have a password. Use “Change password” instead.');
  }

  try {
    await auth.api.setPassword({
      body: { newPassword: parsed.data.newPassword },
      headers: await headers(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error({ userId: current.id, error: message }, 'setPassword failed');
    return err(`Could not set password: ${message}`);
  }

  log.info({ userId: current.id }, 'Password set for previously password-less account');
  revalidatePath('/account');
  return ok(null);
}
