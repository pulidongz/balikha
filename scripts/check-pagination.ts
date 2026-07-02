/**
 * Integration guard on the cursor pagination added for the wishlist + following
 * lists (issue #127). Inserts its own fixtures against seeded rows, pages
 * through with a small limit, and asserts: every inserted row is returned
 * exactly once (no skips, no duplicates), global order is createdAt-DESC, the
 * same-timestamp tiebreaker works, and nextCursor terminates. Cleans up only
 * the rows it inserted. Requires `npm run db:seed`.
 * Run: npm run test:pagination
 */
import { and, eq, inArray, like, notInArray, sql } from 'drizzle-orm';
import { db } from '@/db';
import {
  artisanFollows,
  artisanProfiles,
  products,
  user,
  wishlistItems,
  workComments,
} from '@/db/schema';
import { getWishlistPage, type WishlistRow } from '@/lib/queries/wishlist';
import { getFollowingPage, type FollowingRow } from '@/lib/queries/follows';
import { getWorkCommentsPage, type WorkCommentRow } from '@/lib/queries/comments';
import { assert, section, finish } from './lib/check-harness';

function isNonDecreasing(dates: Date[]): boolean {
  for (let i = 1; i < dates.length; i += 1) {
    const cur = dates[i];
    const prev = dates[i - 1];
    if (cur && prev && cur.getTime() < prev.getTime()) return false;
  }
  return true;
}

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
  if (!buyer) {
    console.error('✗ no non-artisan buyer found — run `npm run db:seed` first');
    process.exit(1);
  }
  // Pick fixtures the buyer does NOT already have, so the delete-by-id cleanup
  // only ever removes rows THIS run inserted (never a developer's pre-existing
  // wishlist/follow data on a seeded product/artisan).
  const prods = await db
    .select({ id: products.id })
    .from(products)
    .where(
      notInArray(
        products.id,
        db
          .select({ pid: wishlistItems.productId })
          .from(wishlistItems)
          .where(eq(wishlistItems.userId, buyer.id)),
      ),
    )
    .limit(5);
  const artisans = await db
    .select({ id: artisanProfiles.id })
    .from(artisanProfiles)
    .where(
      notInArray(
        artisanProfiles.id,
        db
          .select({ aid: artisanFollows.artisanProfileId })
          .from(artisanFollows)
          .where(eq(artisanFollows.userId, buyer.id)),
      ),
    )
    .limit(5);
  if (prods.length < 5 || artisans.length < 5) {
    console.error('✗ not enough seeded data — run `npm run db:seed` first');
    process.exit(1);
  }

  const productIds = prods.map((p) => p.id);
  const artisanIds = artisans.map((a) => a.id);
  const commentProductId = productIds[0];
  const microProductId = productIds[1];
  if (!commentProductId || !microProductId) {
    console.error('✗ not enough seeded products for comment fixtures');
    process.exit(1);
  }
  const COMMENT_MARK = 'pagination-test-';
  // Sub-millisecond fixtures (#135): three comments in the SAME millisecond but
  // different microseconds. Written as raw SQL timestamp literals since a JS Date
  // can't express sub-ms. On the fixed timestamp(3) columns these all round to
  // …10.123, so the id tiebreaker must page through them with no skip; on the old
  // microsecond columns the ms-truncated cursor would skip two of them.
  const MICRO_MARK = 'usprec-';
  const microStamps = ['12:00:10.123111', '12:00:10.123222', '12:00:10.123333'];
  // Distinct timestamps, EXCEPT indices 1 and 2 share one — this exercises the
  // (createdAt, tiebreaker) keyset path where createdAt alone is ambiguous.
  const base = new Date('2026-06-01T12:00:00.000Z');
  const stamp = (i: number) => new Date(base.getTime() - (i === 2 ? 1 : i) * 1000);
  const newest = base; // stamp(0) — the single newest comment

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
    // Comment fixtures live on one seeded product, tagged with COMMENT_MARK so
    // cleanup is precise. Delete any residue from a prior crashed run first.
    await db
      .delete(workComments)
      .where(
        and(
          eq(workComments.productId, commentProductId),
          like(workComments.body, `${COMMENT_MARK}%`),
        ),
      );
    await db.insert(workComments).values(
      [0, 1, 2, 3, 4].map((i) => ({
        productId: commentProductId,
        userId: buyer.id,
        body: `${COMMENT_MARK}${i}`,
        createdAt: stamp(i),
      })),
    );
    // Sub-ms fixtures on a second product (see MICRO_MARK note above).
    await db
      .delete(workComments)
      .where(
        and(eq(workComments.productId, microProductId), like(workComments.body, `${MICRO_MARK}%`)),
      );
    await db.insert(workComments).values(
      microStamps.map((ts, i) => ({
        productId: microProductId,
        userId: buyer.id,
        body: `${MICRO_MARK}${i}`,
        createdAt: sql`timestamp '2026-06-01 ${sql.raw(ts)}'`,
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

    // --- Comments pagination (newest-window default, cursor walks BACKWARD) ---
    section('getWorkCommentsPage — latest window + walk-earlier');
    const windows: WorkCommentRow[][] = [];
    let cCursor: string | null = null;
    let cPages = 0;
    do {
      const p = await getWorkCommentsPage(commentProductId, { cursor: cCursor, limit: 2 });
      windows.push(p.items);
      cCursor = p.nextCursor;
      cPages += 1;
      if (cPages > 200) throw new Error('runaway comments pagination');
    } while (cCursor);
    const flat = windows.flat();
    const mine = flat.filter((c) => c.body.startsWith(COMMENT_MARK));
    const mineIds = mine.map((c) => c.id);
    const firstWindow = windows[0] ?? [];
    assert(cPages >= 3, `comments paged across multiple windows (${cPages} for limit 2)`);
    assert(mine.length === 5, `all 5 inserted comments returned (got ${mine.length})`);
    assert(new Set(mineIds).size === mineIds.length, 'no duplicate comments across windows');
    assert(
      windows.every((w) => isNonDecreasing(w.map((c) => c.createdAt))),
      'each window renders chronologically (ASC)',
    );
    assert(
      firstWindow.at(-1)?.createdAt.getTime() === newest.getTime(),
      'default (no-cursor) window ends with the newest comment',
    );

    // --- Sub-millisecond keyset (#135): same-ms rows must not be skipped ---
    section('getWorkCommentsPage — same-millisecond rows (microsecond precision)');
    // limit 1 forces a page boundary between every same-ms row — the exact spot
    // the ms-truncated cursor used to skip.
    const micro = await collectAll<WorkCommentRow>((cursor) =>
      getWorkCommentsPage(microProductId, { cursor, limit: 1 }),
    );
    const microMine = micro.items.filter((c) => c.body.startsWith(MICRO_MARK));
    const microIds = microMine.map((c) => c.id);
    assert(
      microMine.length === microStamps.length,
      `all ${microStamps.length} same-ms rows returned, none skipped (got ${microMine.length})`,
    );
    assert(new Set(microIds).size === microIds.length, 'no duplicate same-ms rows across pages');
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
    await db
      .delete(workComments)
      .where(
        and(
          eq(workComments.productId, commentProductId),
          like(workComments.body, `${COMMENT_MARK}%`),
        ),
      );
    await db
      .delete(workComments)
      .where(
        and(eq(workComments.productId, microProductId), like(workComments.body, `${MICRO_MARK}%`)),
      );
  }

  finish('All pagination checks passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
