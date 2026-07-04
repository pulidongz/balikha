'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { appreciations, artisanProfiles, products } from '@/db/schema';
import { getCurrentUser, NOT_AUTHENTICATED_MESSAGE } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { logAnalyticsEvent } from '@/lib/analytics/log';
import { emitDedupedNotification } from '@/lib/notifications/emit';
import { workPath } from '@/lib/routes';

const toggleSchema = z.object({
  productId: z.string().uuid(),
  appreciate: z.boolean(),
});

// Same shape as toggleWishlistAction: the desired end-state comes in, so
// two optimistic clicks racing each other converge on whichever landed
// last, and the composite PK + onConflictDoNothing make repeats no-ops.
export async function toggleAppreciationAction(
  input: unknown,
): Promise<Result<{ appreciated: boolean }>> {
  const log = await getRequestLogger();

  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const current = await getCurrentUser();
  if (!current) return err(NOT_AUTHENTICATED_MESSAGE);

  const { productId, appreciate } = parsed.data;

  if (appreciate) {
    // One lookup serves both the own-work guard (appreciating your own
    // work is meaningless — same rule as wishlist/follow) and the
    // artisanProfileId the analytics event needs for per-seller rollups
    // (T11) and notifications (T10). Removal stays unguarded: an existing
    // row should always be deletable.
    const [work] = await db
      .select({
        artisanProfileId: products.artisanProfileId,
        ownerUserId: artisanProfiles.userId,
        title: products.title,
        slug: products.slug,
        shopSlug: artisanProfiles.shopSlug,
      })
      .from(products)
      .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
      .where(eq(products.id, productId))
      .limit(1);
    if (!work) return err('That work could not be found.');
    if (work.ownerUserId === current.id) {
      return err('This is your own work — appreciation flows the other way.');
    }

    await db.insert(appreciations).values({ userId: current.id, productId }).onConflictDoNothing();
    log.info({ userId: current.id, productId }, 'Work appreciated');
    await logAnalyticsEvent({
      type: 'work_appreciated',
      userId: current.id,
      artisanProfileId: work.artisanProfileId,
      entityType: 'product',
      entityId: productId,
    });

    // T10: tell the artist. Anonymous like the public count (appreciation
    // identities are never surfaced); deduped on unread per work.
    await emitDedupedNotification({
      userId: work.ownerUserId,
      type: 'work_appreciated',
      title: `“${work.title}” received an appreciation`,
      body: null,
      target: { kind: 'product', id: productId, url: workPath(work.shopSlug, work.slug) },
    });
  } else {
    await db
      .delete(appreciations)
      .where(and(eq(appreciations.userId, current.id), eq(appreciations.productId, productId)));
    log.info({ userId: current.id, productId }, 'Appreciation removed');
  }

  return ok({ appreciated: appreciate });
}
