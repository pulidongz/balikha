'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { getCurrentUser, NOT_AUTHENTICATED_MESSAGE } from '@/lib/auth-helpers';
import { notNewMessage } from '@/lib/queries/account';
import { ok, err, type Result } from '@/lib/result';

const markReadSchema = z.object({ id: z.string().uuid() });

// Ownership check via WHERE — without `userId = current.id`, a malicious
// caller could mark someone else's notification as read by guessing IDs.
// Single statement keeps this IDOR-safe in one round-trip.
export async function markReadAction(input: unknown): Promise<Result<null>> {
  const parsed = markReadSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const current = await getCurrentUser();
  if (!current) return err(NOT_AUTHENTICATED_MESSAGE);

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, parsed.data.id),
        eq(notifications.userId, current.id),
        isNull(notifications.readAt),
      ),
    );

  // Sidebar badge is fetched in the layout — revalidate any /account/* path
  // so the next render reflects the new unread count.
  revalidatePath('/account', 'layout');
  return ok(null);
}

export async function markAllReadAction(): Promise<Result<null>> {
  const current = await getCurrentUser();
  if (!current) return err(NOT_AUTHENTICATED_MESSAGE);

  // "Mark all read" must NOT clear unread message notifications: they
  // are owned by the Messages surface and cleared per-thread via
  // markThreadRead. Clearing them here would silently zero the Messages
  // badge for threads the user never opened.
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, current.id), isNull(notifications.readAt), notNewMessage));

  revalidatePath('/account', 'layout');
  return ok(null);
}
