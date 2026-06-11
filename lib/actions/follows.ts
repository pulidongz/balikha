'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanFollows } from '@/db/schema';
import { getCurrentUser } from '@/lib/auth-helpers';
import { ok, err, type Result } from '@/lib/result';
import { getRequestLogger } from '@/lib/logger-context';
import { logAnalyticsEvent } from '@/lib/analytics/log';

const toggleSchema = z.object({
  artisanProfileId: z.string().uuid(),
  follow: z.boolean(),
});

// Same shape as toggleWishlistAction: pass desired end-state rather than
// flipping current state, so two clicks racing each other converge on
// whichever click landed last.
export async function toggleFollowAction(input: unknown): Promise<Result<{ following: boolean }>> {
  const log = await getRequestLogger();

  const parsed = toggleSchema.safeParse(input);
  if (!parsed.success) return err('Invalid input');

  const current = await getCurrentUser();
  if (!current) return err('You must be signed in.');

  const { artisanProfileId, follow } = parsed.data;

  if (follow) {
    // Composite primary key on (userId, artisanProfileId) makes this
    // structurally idempotent — onConflictDoNothing absorbs the race.
    await db
      .insert(artisanFollows)
      .values({ userId: current.id, artisanProfileId })
      .onConflictDoNothing();
    log.info({ userId: current.id, artisanProfileId }, 'Artisan follow');
    await logAnalyticsEvent({
      type: 'artisan_followed',
      userId: current.id,
      artisanProfileId,
      entityType: 'artisan',
      entityId: artisanProfileId,
    });
  } else {
    await db
      .delete(artisanFollows)
      .where(
        and(
          eq(artisanFollows.userId, current.id),
          eq(artisanFollows.artisanProfileId, artisanProfileId),
        ),
      );
    log.info({ userId: current.id, artisanProfileId }, 'Artisan unfollow');
  }

  revalidatePath('/account/following');
  // The signed-in homepage is the feed (T6).
  revalidatePath('/');
  return ok({ following: follow });
}
