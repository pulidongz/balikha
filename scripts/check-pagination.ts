/**
 * Integration guard on the cursor pagination added for the wishlist + following
 * lists (issue #127). Inserts its own fixtures against seeded rows, pages
 * through with a small limit, and asserts: every inserted row is returned
 * exactly once (no skips, no duplicates), global order is createdAt-DESC, the
 * same-timestamp tiebreaker works, and nextCursor terminates. Cleans up only
 * the rows it inserted. Requires `npm run db:seed`.
 * Run: npm run test:pagination
 */
import { and, eq, inArray, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import { artisanFollows, artisanProfiles, products, user, wishlistItems } from '@/db/schema';
import { getWishlistPage, type WishlistRow } from '@/lib/queries/wishlist';
import { getFollowingPage, type FollowingRow } from '@/lib/queries/follows';
import { assert, section, finish } from './lib/check-harness';

// Collect every item across pages, following nextCursor. Bounded so a
// pagination bug (nextCursor never null) fails loudly instead of looping.
async function collectAll<T>(
  fetchPage: (cursor: string | null) => Promise<{ items: T[]; nextCursor: string | null }>,
): Promise<{ items: T[]; pages: number }> {
  const items: T[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    cursor = page.nextCursor;
    pages += 1;
    if (pages > 200) throw new Error('runaway pagination — nextCursor never terminated');
  } while (cursor);
  return { items, pages };
}

function isNonIncreasing(dates: Date[]): boolean {
  for (let i = 1; i < dates.length; i += 1) {
    const cur = dates[i];
    const prev = dates[i - 1];
    if (cur && prev && cur.getTime() > prev.getTime()) return false;
  }
  return true;
}

async function main(): Promise<void> {
  // A pure buyer (no artisan profile) to hang wishlist/follow fixtures on.
  const [buyer] = await db
    .select({ id: user.id })
    .from(user)
    .where(notInArray(user.id, db.select({ uid: artisanProfiles.userId }).from(artisanProfiles)))
    .limit(1);
  const prods = await db.select({ id: products.id }).from(products).limit(5);
  const artisans = await db.select({ id: artisanProfiles.id }).from(artisanProfiles).limit(5);
  if (!buyer || prods.length < 5 || artisans.length < 5) {
    console.error('✗ not enough seeded data — run `npm run db:seed` first');
    process.exit(1);
  }

  const productIds = prods.map((p) => p.id);
  const artisanIds = artisans.map((a) => a.id);
  // Distinct timestamps, EXCEPT indices 1 and 2 share one — this exercises the
  // (createdAt, tiebreaker) keyset path where createdAt alone is ambiguous.
  const base = new Date('2026-06-01T12:00:00.000Z');
  const stamp = (i: number) => new Date(base.getTime() - (i === 2 ? 1 : i) * 1000);

  try {
    // --- Fixtures ---
    await db
      .delete(wishlistItems)
      .where(and(eq(wishlistItems.userId, buyer.id), inArray(wishlistItems.productId, productIds)));
    await db
      .delete(artisanFollows)
      .where(
        and(
          eq(artisanFollows.userId, buyer.id),
          inArray(artisanFollows.artisanProfileId, artisanIds),
        ),
      );
    await db
      .insert(wishlistItems)
      .values(
        productIds.map((pid, i) => ({ userId: buyer.id, productId: pid, createdAt: stamp(i) })),
      );
    await db.insert(artisanFollows).values(
      artisanIds.map((aid, i) => ({
        userId: buyer.id,
        artisanProfileId: aid,
        createdAt: stamp(i),
      })),
    );

    // --- Wishlist pagination (limit 2 over 5 fixtures) ---
    section('getWishlistPage — keyset pagination');
    const wl = await collectAll<WishlistRow>((cursor) =>
      getWishlistPage(buyer.id, { cursor, limit: 2 }),
    );
    const wlMine = wl.items.filter((r) => productIds.includes(r.id));
    const wlIds = wlMine.map((r) => r.wishlistId);
    assert(wl.pages >= 3, `paged across multiple requests (${wl.pages} pages for limit 2)`);
    assert(wlMine.length === 5, `all 5 inserted wishlist rows returned (got ${wlMine.length})`);
    assert(new Set(wlIds).size === wlIds.length, 'no duplicate wishlist rows across pages');
    assert(isNonIncreasing(wl.items.map((r) => r.addedAt)), 'wishlist ordered by addedAt DESC');

    // --- Following pagination (limit 2 over 5 fixtures) ---
    section('getFollowingPage — keyset pagination (artisanProfileId tiebreaker)');
    const fl = await collectAll<FollowingRow>((cursor) =>
      getFollowingPage(buyer.id, { cursor, limit: 2 }),
    );
    const flMine = fl.items.filter((r) => artisanIds.includes(r.id));
    const flIds = flMine.map((r) => r.id);
    assert(fl.pages >= 3, `paged across multiple requests (${fl.pages} pages for limit 2)`);
    assert(flMine.length === 5, `all 5 inserted follows returned (got ${flMine.length})`);
    assert(
      new Set(flIds).size === flIds.length,
      'no duplicate follows across pages (tiebreaker ok)',
    );
    assert(
      isNonIncreasing(fl.items.map((r) => r.followedAt)),
      'following ordered by followedAt DESC',
    );
  } finally {
    // Remove only the rows this test inserted.
    await db
      .delete(wishlistItems)
      .where(and(eq(wishlistItems.userId, buyer.id), inArray(wishlistItems.productId, productIds)));
    await db
      .delete(artisanFollows)
      .where(
        and(
          eq(artisanFollows.userId, buyer.id),
          inArray(artisanFollows.artisanProfileId, artisanIds),
        ),
      );
  }

  finish('All pagination checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
