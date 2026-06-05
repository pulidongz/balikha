'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { auth } from '@/lib/auth';
import { requireAdmin } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { recordAdminAction } from '@/lib/admin/audit';
import { hideSellerListings, restoreSellerListings } from '@/lib/admin/seller-content';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const suspendInputSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().min(1, 'Reason is required'),
  durationDays: z.number().int().positive('Duration must be a positive integer'),
});

const banInputSchema = z.object({
  userId: z.string().min(1),
  reason: z.string().min(1, 'Reason is required'),
});

const userIdInputSchema = z.object({
  userId: z.string().min(1),
});

// ---------------------------------------------------------------------------
// suspendUser
// ---------------------------------------------------------------------------
// Suspend = ban WITH a banExpires (timed block).  The plugin auto-clears
// banned at banExpires but does NOT restore listings; the reconciler (Task 2.7)
// handles that.  The same reason is written to both banUser and the audit row
// (Issue 5 — they must never diverge).
// ---------------------------------------------------------------------------

export async function suspendUser(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = suspendInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await requireAdmin().catch(() => null);
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();
  const { userId, reason, durationDays } = parsed.data;

  // banExpiresIn is in seconds; the plugin accepts it as a duration.
  const banExpiresIn = durationDays * 24 * 60 * 60;

  try {
    await auth.api.banUser({
      body: { userId, banReason: reason, banExpiresIn },
      headers: await headers(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { adminId: admin.id, targetUserId: userId, error: message },
      'banUser (suspend) failed',
    );
    return err(`Failed to suspend user: ${message}`);
  }

  try {
    await db.transaction(async (tx) => {
      await hideSellerListings(userId, tx);
      await recordAdminAction(
        {
          actorUserId: admin.id,
          action: 'suspend',
          targetUserId: userId,
          reason,
          metadata: { durationDays },
        },
        tx,
      );
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { adminId: admin.id, targetUserId: userId, error: message },
      'post-suspend transaction failed',
    );
    return err(`User was suspended but follow-up failed — listings may still be visible. Error: ${message}`);
  }

  log.info({ adminId: admin.id, targetUserId: userId, durationDays }, 'User suspended');

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);

  return ok({ userId });
}

// ---------------------------------------------------------------------------
// unsuspendUser
// ---------------------------------------------------------------------------

export async function unsuspendUser(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = userIdInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await requireAdmin().catch(() => null);
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();
  const { userId } = parsed.data;

  try {
    await auth.api.unbanUser({
      body: { userId },
      headers: await headers(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { adminId: admin.id, targetUserId: userId, error: message },
      'unbanUser (unsuspend) failed',
    );
    return err(`Failed to unsuspend user: ${message}`);
  }

  try {
    await db.transaction(async (tx) => {
      await restoreSellerListings(userId, tx);
      await recordAdminAction(
        {
          actorUserId: admin.id,
          action: 'unsuspend',
          targetUserId: userId,
        },
        tx,
      );
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { adminId: admin.id, targetUserId: userId, error: message },
      'post-unsuspend transaction failed',
    );
    return err(`Failed to complete unsuspend follow-up: ${message}`);
  }

  log.info({ adminId: admin.id, targetUserId: userId }, 'User unsuspended');

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);

  return ok({ userId });
}

// ---------------------------------------------------------------------------
// banUser
// ---------------------------------------------------------------------------
// Permanent ban — no banExpiresIn.
// ---------------------------------------------------------------------------

export async function banUser(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = banInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await requireAdmin().catch(() => null);
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();
  const { userId, reason } = parsed.data;

  try {
    await auth.api.banUser({
      body: { userId, banReason: reason },
      headers: await headers(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error({ adminId: admin.id, targetUserId: userId, error: message }, 'banUser (ban) failed');
    return err(`Failed to ban user: ${message}`);
  }

  try {
    await db.transaction(async (tx) => {
      await hideSellerListings(userId, tx);
      await recordAdminAction(
        {
          actorUserId: admin.id,
          action: 'ban',
          targetUserId: userId,
          reason,
        },
        tx,
      );
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { adminId: admin.id, targetUserId: userId, error: message },
      'post-ban transaction failed',
    );
    return err(`User was banned but follow-up failed — listings may still be visible. Error: ${message}`);
  }

  log.info({ adminId: admin.id, targetUserId: userId }, 'User banned');

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);

  return ok({ userId });
}

// ---------------------------------------------------------------------------
// unbanUser
// ---------------------------------------------------------------------------

export async function unbanUser(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = userIdInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await requireAdmin().catch(() => null);
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();
  const { userId } = parsed.data;

  try {
    await auth.api.unbanUser({
      body: { userId },
      headers: await headers(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { adminId: admin.id, targetUserId: userId, error: message },
      'unbanUser (unban) failed',
    );
    return err(`Failed to unban user: ${message}`);
  }

  try {
    await db.transaction(async (tx) => {
      await restoreSellerListings(userId, tx);
      await recordAdminAction(
        {
          actorUserId: admin.id,
          action: 'unban',
          targetUserId: userId,
        },
        tx,
      );
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { adminId: admin.id, targetUserId: userId, error: message },
      'post-unban transaction failed',
    );
    return err(`Failed to complete unban follow-up: ${message}`);
  }

  log.info({ adminId: admin.id, targetUserId: userId }, 'User unbanned');

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);

  return ok({ userId });
}

// ---------------------------------------------------------------------------
// promoteToAdmin  (Task 2.4)
// ---------------------------------------------------------------------------

export async function promoteToAdmin(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = userIdInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await requireAdmin().catch(() => null);
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();
  const { userId } = parsed.data;

  try {
    await auth.api.setRole({
      body: { userId, role: 'admin' },
      headers: await headers(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { adminId: admin.id, targetUserId: userId, error: message },
      'setRole (promote) failed',
    );
    return err(`Failed to promote user: ${message}`);
  }

  try {
    await recordAdminAction({
      actorUserId: admin.id,
      action: 'promote_admin',
      targetUserId: userId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { adminId: admin.id, targetUserId: userId, error: message },
      'promote audit write failed',
    );
    return err(`Failed to record promotion audit: ${message}`);
  }

  log.info({ adminId: admin.id, targetUserId: userId }, 'User promoted to admin');

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);

  return ok({ userId });
}

// ---------------------------------------------------------------------------
// demoteToUser  (Task 2.4)
// ---------------------------------------------------------------------------

export async function demoteToUser(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = userIdInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await requireAdmin().catch(() => null);
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();
  const { userId } = parsed.data;

  if (userId === admin.id) return err('You cannot demote your own account');

  const [adminCount] = await db
    .select({ count: count() })
    .from(user)
    .where(eq(user.role, 'admin'));
  if ((adminCount?.count ?? 0) <= 1) return err('Cannot demote the last remaining admin');

  try {
    await auth.api.setRole({
      body: { userId, role: 'user' },
      headers: await headers(),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { adminId: admin.id, targetUserId: userId, error: message },
      'setRole (demote) failed',
    );
    return err(`Failed to demote user: ${message}`);
  }

  try {
    await recordAdminAction({
      actorUserId: admin.id,
      action: 'demote_admin',
      targetUserId: userId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error(
      { adminId: admin.id, targetUserId: userId, error: message },
      'demote audit write failed',
    );
    return err(`Failed to record demotion audit: ${message}`);
  }

  log.info({ adminId: admin.id, targetUserId: userId }, 'User demoted to user');

  revalidatePath('/admin/users');
  revalidatePath(`/admin/users/${userId}`);

  return ok({ userId });
}
