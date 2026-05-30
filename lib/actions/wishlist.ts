'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { wishlistItems } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { logAnalyticsEvent } from '@/lib/analytics/log';

const toggleSchema = z.object({
  productId: z.string().uuid(),
  add: z.boolean(),
});

// Toggle a product on/off the buyer's default wishlist. The action accepts
// the desired end-state as `add` (rather than reading current state and
// flipping) so optimistic-UI clients can race two clicks without ever
// flipping back to the wrong state — both calls converge on the value the
// last click chose.
export async function toggleWishlistAction(
  input: unknown,
): Promise<Result<{ inWishlist: boolean }>> {
  const log = await getRequestLogger();

  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  const { productId, add } = parsed.data;

  if (add) {
    // onConflictDoNothing — second click within the optimistic window
    // shouldn't error, the row already exists.
    await db.insert(wishlistItems).values({ userId: current.id, productId }).onConflictDoNothing();
    log.info({ userId: current.id, productId }, 'Wishlist add');
    await logAnalyticsEvent({
      type: 'wishlist_added',
      userId: current.id,
      entityType: 'product',
      entityId: productId,
    });
  } else {
    await db
      .delete(wishlistItems)
      .where(and(eq(wishlistItems.userId, current.id), eq(wishlistItems.productId, productId)));
    log.info({ userId: current.id, productId }, 'Wishlist remove');
  }

  revalidatePath('/account/wishlist');
  return ok({ inWishlist: add });
}
