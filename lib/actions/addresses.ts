'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, ne } from 'drizzle-orm';
import { db } from '@/db';
import { userAddresses } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { addressCreateSchema, addressUpdateSchema } from '@/lib/validators/buyer';

// Default-shipping/billing flags are mutually exclusive per user. Both
// create and update unset the previous default *only when* the incoming row
// claims that flag — unchecking the box on an existing default is allowed
// to leave the user with no default at all (Phase 5 checkout will require
// one at order time, not before).

export async function createAddressAction(formData: FormData): Promise<Result<{ id: string }>> {
  const log = await getRequestLogger();
  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  const parsed = addressCreateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }
  const input = parsed.data;

  const id = await db.transaction(async (tx) => {
    if (input.isDefaultShipping) {
      await tx
        .update(userAddresses)
        .set({ isDefaultShipping: false })
        .where(
          and(eq(userAddresses.userId, current.id), eq(userAddresses.isDefaultShipping, true)),
        );
    }
    if (input.isDefaultBilling) {
      await tx
        .update(userAddresses)
        .set({ isDefaultBilling: false })
        .where(and(eq(userAddresses.userId, current.id), eq(userAddresses.isDefaultBilling, true)));
    }
    const [row] = await tx
      .insert(userAddresses)
      .values({ ...input, userId: current.id })
      .returning({ id: userAddresses.id });
    if (!row) throw new Error('Failed to insert address');
    return row.id;
  });

  log.info({ userId: current.id, addressId: id }, 'Address created');
  revalidatePath('/account/addresses');
  return ok({ id });
}

export async function updateAddressAction(
  addressId: string,
  formData: FormData,
): Promise<Result<null>> {
  const log = await getRequestLogger();
  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  const parsed = addressUpdateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return err('Invalid input', parsed.error.flatten().fieldErrors);
  }
  const input = parsed.data;

  const updated = await db.transaction(async (tx) => {
    // Ownership check. Locked into the same tx as the writes so a
    // concurrent change can't sneak between read and update.
    const [existing] = await tx
      .select({ id: userAddresses.id })
      .from(userAddresses)
      .where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, current.id)))
      .limit(1);
    if (!existing) return false;

    if (input.isDefaultShipping) {
      await tx
        .update(userAddresses)
        .set({ isDefaultShipping: false })
        .where(
          and(
            eq(userAddresses.userId, current.id),
            eq(userAddresses.isDefaultShipping, true),
            ne(userAddresses.id, addressId),
          ),
        );
    }
    if (input.isDefaultBilling) {
      await tx
        .update(userAddresses)
        .set({ isDefaultBilling: false })
        .where(
          and(
            eq(userAddresses.userId, current.id),
            eq(userAddresses.isDefaultBilling, true),
            ne(userAddresses.id, addressId),
          ),
        );
    }

    await tx
      .update(userAddresses)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(userAddresses.id, addressId));
    return true;
  });

  if (!updated) return err('Address not found or not owned.');

  log.info({ userId: current.id, addressId }, 'Address updated');
  revalidatePath('/account/addresses');
  return ok(null);
}

export async function deleteAddressAction(addressId: string): Promise<Result<null>> {
  const log = await getRequestLogger();
  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  // Single DELETE constrained by id + userId — IDOR-safe in one query.
  const result = await db
    .delete(userAddresses)
    .where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, current.id)));

  if ((result as { rowCount?: number }).rowCount === 0) {
    return err('Address not found or not owned.');
  }

  log.info({ userId: current.id, addressId }, 'Address deleted');
  revalidatePath('/account/addresses');
  return ok(null);
}
