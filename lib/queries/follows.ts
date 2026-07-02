import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanFollows, artisanProfiles } from '@/db/schema';
import { decodeCursor, encodeCursor } from './cursor';
import { clampLimit, keysetBefore, type Page, type PageRequest } from './paginate';

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

export interface FollowingRow {
  id: string;
  shopSlug: string;
  shopName: string;
  location: string | null;
  bannerImageUrl: string | null;
  followedAt: Date;
}

/**
 * One page of the studios a user follows, most-recently-followed first.
 *
 * artisan_follows has a composite PK (userId, artisanProfileId) and NO id
 * column, so the keyset tiebreaker is artisanProfileId (== artisanProfiles.id
 * via the join). Fetches limit+1 to detect a next page without a count query.
 */
export async function getFollowingPage(
  userId: string,
  req: PageRequest = {},
): Promise<Page<FollowingRow>> {
  const limit = clampLimit(req.limit);
  const cursor = req.cursor ? decodeCursor(req.cursor) : null;

  const rows = await db
    .select({
      id: artisanProfiles.id,
      shopSlug: artisanProfiles.shopSlug,
      shopName: artisanProfiles.shopName,
      location: artisanProfiles.location,
      bannerImageUrl: artisanProfiles.bannerImageUrl,
      followedAt: artisanFollows.createdAt,
    })
    .from(artisanFollows)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, artisanFollows.artisanProfileId))
    .where(
      cursor
        ? and(
            eq(artisanFollows.userId, userId),
            // No id column on artisan_follows (composite PK) → artisanProfileId
            // is the keyset tiebreaker.
            keysetBefore(artisanFollows.createdAt, artisanFollows.artisanProfileId, cursor),
          )
        : eq(artisanFollows.userId, userId),
    )
    .orderBy(desc(artisanFollows.createdAt), desc(artisanFollows.artisanProfileId))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? encodeCursor(last.followedAt, last.id) : null,
  };
}

// Accurate total for the page header. Single indexed COUNT by userId.
export async function countFollowing(userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(artisanFollows)
    .where(eq(artisanFollows.userId, userId));
  return row?.value ?? 0;
}
