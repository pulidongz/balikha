import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanFollows } from '@/db/schema';

// Cheap PK lookup — shared by the studio page and the work page so both
// can seed FollowToggle's optimistic state. Null viewer short-circuits.
export async function isFollowingArtisan(
  userId: string | null,
  artisanProfileId: string,
): Promise<boolean> {
  if (!userId) return false;
  const [row] = await db
    .select({ userId: artisanFollows.userId })
    .from(artisanFollows)
    .where(
      and(eq(artisanFollows.userId, userId), eq(artisanFollows.artisanProfileId, artisanProfileId)),
    )
    .limit(1);
  return Boolean(row);
}
