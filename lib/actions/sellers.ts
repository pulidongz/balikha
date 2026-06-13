'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/db';
import { artisanProfiles, notifications } from '@/db/schema';
import { tryRequireAdmin } from '@/lib/auth-helpers';
import { recordAdminAction } from '@/lib/admin/audit';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { dispatchSellerApplicationEmail } from '@/lib/email/notifications';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const approveInputSchema = z.object({
  artisanProfileId: z.string().uuid(),
});

const rejectInputSchema = z.object({
  artisanProfileId: z.string().uuid(),
  // Applicant-facing rejection reason (Decision #7). Optional — admin may
  // approve or reject without a note, though a note is recommended on reject.
  note: z.string().max(2000).optional(),
});

// ---------------------------------------------------------------------------
// approveSellerApplication
// ---------------------------------------------------------------------------
// Sets the seller profile to `approved` and notifies the applicant (in-app
// row + email). Works on any source status — including `rejected` (re-open,
// Decision #4). Returns Result<{ artisanProfileId }>.
// ---------------------------------------------------------------------------

export async function approveSellerApplication(
  input: unknown,
): Promise<Result<{ artisanProfileId: string }>> {
  const parsed = approveInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await tryRequireAdmin();
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();

  const now = new Date();

  // Load the profile to get the applicant's userId for the notification.
  const [profile] = await db
    .select({
      id: artisanProfiles.id,
      userId: artisanProfiles.userId,
      shopName: artisanProfiles.shopName,
    })
    .from(artisanProfiles)
    .where(eq(artisanProfiles.id, parsed.data.artisanProfileId))
    .limit(1);

  if (!profile) return err('Seller profile not found');

  await db.transaction(async (tx) => {
    await tx
      .update(artisanProfiles)
      .set({
        approvalStatus: 'approved',
        approvalNote: null,
        reviewedAt: now,
        reviewedById: admin.id,
        updatedAt: now,
      })
      .where(eq(artisanProfiles.id, profile.id));

    await tx.insert(notifications).values({
      userId: profile.userId,
      type: 'seller_application_approved',
      title: 'Your seller application was approved',
      body: 'Your Balikha seller account is now active. You can start publishing your products.',
      target: {
        kind: 'seller_application',
        id: profile.id,
        url: '/dashboard',
      },
    });

    await recordAdminAction(
      {
        actorUserId: admin.id,
        action: 'approve_seller',
        targetUserId: profile.userId,
        metadata: { artisanProfileId: profile.id, shopName: profile.shopName },
      },
      tx,
    );
  });

  log.info(
    { adminId: admin.id, artisanProfileId: profile.id, decision: 'approved' },
    'Seller application approved',
  );

  after(() =>
    dispatchSellerApplicationEmail({
      recipientUserId: profile.userId,
      decision: 'approved',
    }),
  );

  revalidatePath('/admin/sellers');
  revalidatePath(`/admin/sellers/${profile.id}`);

  return ok({ artisanProfileId: profile.id });
}

// ---------------------------------------------------------------------------
// rejectSellerApplication
// ---------------------------------------------------------------------------
// Sets the seller profile to `rejected`, stores the applicant-facing note,
// and notifies the applicant. Works on any source status (Decision #4).
// ---------------------------------------------------------------------------

export async function rejectSellerApplication(
  input: unknown,
): Promise<Result<{ artisanProfileId: string }>> {
  const parsed = rejectInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await tryRequireAdmin();
  if (!admin) return err('Admin required');

  const log = await getRequestLogger();

  const now = new Date();

  const [profile] = await db
    .select({
      id: artisanProfiles.id,
      userId: artisanProfiles.userId,
      shopName: artisanProfiles.shopName,
    })
    .from(artisanProfiles)
    .where(eq(artisanProfiles.id, parsed.data.artisanProfileId))
    .limit(1);

  if (!profile) return err('Seller profile not found');

  const note = parsed.data.note ?? null;

  await db.transaction(async (tx) => {
    await tx
      .update(artisanProfiles)
      .set({
        approvalStatus: 'rejected',
        approvalNote: note,
        reviewedAt: now,
        reviewedById: admin.id,
        updatedAt: now,
      })
      .where(eq(artisanProfiles.id, profile.id));

    await tx.insert(notifications).values({
      userId: profile.userId,
      type: 'seller_application_rejected',
      title: 'Your seller application was not approved',
      body: note ?? 'Your Balikha seller application was not approved at this time.',
      target: {
        kind: 'seller_application',
        id: profile.id,
        url: '/dashboard',
      },
    });

    await recordAdminAction(
      {
        actorUserId: admin.id,
        action: 'reject_seller',
        targetUserId: profile.userId,
        reason: note ?? undefined,
        metadata: { artisanProfileId: profile.id, shopName: profile.shopName },
      },
      tx,
    );
  });

  log.info(
    { adminId: admin.id, artisanProfileId: profile.id, decision: 'rejected' },
    'Seller application rejected',
  );

  after(() =>
    dispatchSellerApplicationEmail({
      recipientUserId: profile.userId,
      decision: 'rejected',
      note: note ?? undefined,
    }),
  );

  revalidatePath('/admin/sellers');
  revalidatePath(`/admin/sellers/${profile.id}`);

  return ok({ artisanProfileId: profile.id });
}
