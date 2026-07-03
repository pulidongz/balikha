'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { count, eq } from 'drizzle-orm';
import { db } from '@/db';
import { user } from '@/db/schema';
import { auth } from '@/lib/auth';
import { tryRequireAdmin } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { recordAdminAction } from '@/lib/admin/audit';
import { hideSellerListings, restoreSellerListings } from '@/lib/admin/seller-content';
import { runAdminAuthCall } from '@/lib/admin/auth-call';
import { recordAdminMutation } from '@/lib/admin/user-mutations';

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

  const admin = await tryRequireAdmin();
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();
  const { userId, reason, durationDays } = parsed.data;

  // banExpiresIn is in seconds; the plugin accepts it as a duration.
  const banExpiresIn = durationDays * 24 * 60 * 60;

  const banned = await runAdminAuthCall(
    async () =>
      auth.api.banUser({
        body: { userId, banReason: reason, banExpiresIn },
        headers: await headers(),
      }),
    {
      log,
      adminId: admin.id,
      targetUserId: userId,
      failureLogMessage: 'banUser (suspend) failed',
      failureErrPrefix: 'Failed to suspend user',
    },
  );
  if (!banned.ok) return banned;

  const recorded = await recordAdminMutation({
    log,
    admin,
    userId,
    action: 'suspend',
    reason,
    metadata: { durationDays },
    listingOp: hideSellerListings,
    failureLogMessage: 'post-suspend transaction failed',
    failureErrMessage: (message) =>
      `User was suspended but follow-up failed — listings may still be visible. Error: ${message}`,
    successLogMessage: 'User suspended',
    successLogFields: { durationDays },
  });
  if (!recorded.ok) return recorded;

  return ok({ userId });
}

// ---------------------------------------------------------------------------
// unsuspendUser
// ---------------------------------------------------------------------------

export async function unsuspendUser(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = userIdInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await tryRequireAdmin();
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();
  const { userId } = parsed.data;

  const unbanned = await runAdminAuthCall(
    async () => auth.api.unbanUser({ body: { userId }, headers: await headers() }),
    {
      log,
      adminId: admin.id,
      targetUserId: userId,
      failureLogMessage: 'unbanUser (unsuspend) failed',
      failureErrPrefix: 'Failed to unsuspend user',
    },
  );
  if (!unbanned.ok) return unbanned;

  const recorded = await recordAdminMutation({
    log,
    admin,
    userId,
    action: 'unsuspend',
    listingOp: restoreSellerListings,
    failureLogMessage: 'post-unsuspend transaction failed',
    failureErrMessage: (message) => `Failed to complete unsuspend follow-up: ${message}`,
    successLogMessage: 'User unsuspended',
  });
  if (!recorded.ok) return recorded;

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

  const admin = await tryRequireAdmin();
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();
  const { userId, reason } = parsed.data;

  const banned = await runAdminAuthCall(
    async () => auth.api.banUser({ body: { userId, banReason: reason }, headers: await headers() }),
    {
      log,
      adminId: admin.id,
      targetUserId: userId,
      failureLogMessage: 'banUser (ban) failed',
      failureErrPrefix: 'Failed to ban user',
    },
  );
  if (!banned.ok) return banned;

  const recorded = await recordAdminMutation({
    log,
    admin,
    userId,
    action: 'ban',
    reason,
    listingOp: hideSellerListings,
    failureLogMessage: 'post-ban transaction failed',
    failureErrMessage: (message) =>
      `User was banned but follow-up failed — listings may still be visible. Error: ${message}`,
    successLogMessage: 'User banned',
  });
  if (!recorded.ok) return recorded;

  return ok({ userId });
}

// ---------------------------------------------------------------------------
// unbanUser
// ---------------------------------------------------------------------------

export async function unbanUser(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = userIdInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await tryRequireAdmin();
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();
  const { userId } = parsed.data;

  const unbanned = await runAdminAuthCall(
    async () => auth.api.unbanUser({ body: { userId }, headers: await headers() }),
    {
      log,
      adminId: admin.id,
      targetUserId: userId,
      failureLogMessage: 'unbanUser (unban) failed',
      failureErrPrefix: 'Failed to unban user',
    },
  );
  if (!unbanned.ok) return unbanned;

  const recorded = await recordAdminMutation({
    log,
    admin,
    userId,
    action: 'unban',
    listingOp: restoreSellerListings,
    failureLogMessage: 'post-unban transaction failed',
    failureErrMessage: (message) => `Failed to complete unban follow-up: ${message}`,
    successLogMessage: 'User unbanned',
  });
  if (!recorded.ok) return recorded;

  return ok({ userId });
}

// ---------------------------------------------------------------------------
// promoteToAdmin  (Task 2.4)
// ---------------------------------------------------------------------------

export async function promoteToAdmin(input: unknown): Promise<Result<{ userId: string }>> {
  const parsed = userIdInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await tryRequireAdmin();
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

  const admin = await tryRequireAdmin();
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();
  const { userId } = parsed.data;

  if (userId === admin.id) return err('You cannot demote your own account');

  const [adminCount] = await db.select({ count: count() }).from(user).where(eq(user.role, 'admin'));
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
