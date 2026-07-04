'use server';

import { after } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { db } from '@/db';
import { notifications } from '@/db/schema';
import { ADMIN_REQUIRED_MESSAGE, tryRequireAdmin } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { recordAdminAction } from '@/lib/admin/audit';
import {
  removeListingInTx,
  flagListingInTx,
  reinstateListingInTx,
} from '@/lib/admin/product-moderation';
import { dispatchListingTakedownEmail } from '@/lib/email/notifications';

// ---------------------------------------------------------------------------
// Input schemas
// ---------------------------------------------------------------------------

const removeInputSchema = z.object({
  productId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
});

const flagInputSchema = z.object({
  productId: z.string().uuid(),
  reason: z.string().trim().min(1).max(2000),
});

const reinstateInputSchema = z.object({
  productId: z.string().uuid(),
});

// ---------------------------------------------------------------------------
// removeListing
// ---------------------------------------------------------------------------
// Hard takedown: unpublishes the listing, records the reason, inserts an
// in-app notification for the seller, audits the action, and dispatches a
// takedown email post-commit via after().

export async function removeListing(input: unknown): Promise<Result<{ productId: string }>> {
  const parsed = removeInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await tryRequireAdmin();
  if (!admin) return err(ADMIN_REQUIRED_MESSAGE);

  const log = await getRequestLogger();

  const { productId, reason } = parsed.data;

  const target = await db.transaction(async (tx) => {
    const t = await removeListingInTx(tx, { productId, reason, adminUserId: admin.id });

    await tx.insert(notifications).values({
      userId: t.sellerUserId,
      type: 'listing_taken_down',
      title: 'A listing was removed',
      body: `"${t.title}" was removed by an administrator. Reason: ${reason}`,
      target: { kind: 'product', id: productId, url: '/dashboard' },
    });

    await recordAdminAction(
      {
        actorUserId: admin.id,
        action: 'remove_product',
        targetUserId: t.sellerUserId,
        reason,
        metadata: { productId },
      },
      tx,
    );

    return t;
  });

  log.info(
    { adminId: admin.id, productId, sellerUserId: target.sellerUserId },
    'Admin removed product listing',
  );

  after(() =>
    dispatchListingTakedownEmail({
      recipientUserId: target.sellerUserId,
      productTitle: target.title,
      reason,
    }),
  );

  revalidatePath('/admin/products');
  return ok({ productId });
}

// ---------------------------------------------------------------------------
// flagListing
// ---------------------------------------------------------------------------
// Soft flag: listing stays live, marked for admin attention. No seller
// notification — internal signal only.

export async function flagListing(input: unknown): Promise<Result<{ productId: string }>> {
  const parsed = flagInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await tryRequireAdmin();
  if (!admin) return err(ADMIN_REQUIRED_MESSAGE);

  const log = await getRequestLogger();

  const { productId, reason } = parsed.data;

  const target = await db.transaction(async (tx) => {
    const t = await flagListingInTx(tx, { productId, reason, adminUserId: admin.id });

    await recordAdminAction(
      {
        actorUserId: admin.id,
        action: 'flag_product',
        targetUserId: t.sellerUserId,
        reason,
        metadata: { productId },
      },
      tx,
    );

    return t;
  });

  log.info(
    { adminId: admin.id, productId, sellerUserId: target.sellerUserId },
    'Admin flagged product listing',
  );

  revalidatePath('/admin/products');
  return ok({ productId });
}

// ---------------------------------------------------------------------------
// reinstateListing
// ---------------------------------------------------------------------------
// Clears moderation. If the listing was removed, restores it to published.
// Silent for v1 — no seller notification (admin undo, no email).

export async function reinstateListing(input: unknown): Promise<Result<{ productId: string }>> {
  const parsed = reinstateInputSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input', parsed.error.flatten().fieldErrors);

  const admin = await tryRequireAdmin();
  if (!admin) return err(ADMIN_REQUIRED_MESSAGE);

  const log = await getRequestLogger();

  const { productId } = parsed.data;

  const target = await db.transaction(async (tx) => {
    const t = await reinstateListingInTx(tx, { productId, adminUserId: admin.id });

    await recordAdminAction(
      {
        actorUserId: admin.id,
        action: 'reinstate_product',
        targetUserId: t.sellerUserId,
        metadata: { productId },
      },
      tx,
    );

    return t;
  });

  log.info(
    { adminId: admin.id, productId, sellerUserId: target.sellerUserId },
    'Admin reinstated product listing',
  );

  revalidatePath('/admin/products');
  return ok({ productId });
}
