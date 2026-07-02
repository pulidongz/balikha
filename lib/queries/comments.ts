import { and, count, desc, eq, lt, or } from 'drizzle-orm';
import { db } from '@/db';
import { user, workComments } from '@/db/schema';
import { decodeCursor, encodeCursor } from './cursor';
import { clampLimit, type Page, type PageRequest } from './paginate';

export interface WorkCommentRow {
  id: string;
  body: string;
  createdAt: Date;
  authorUserId: string;
  authorName: string;
}

/**
 * One window of a work's comments, for a URL-paged conversation.
 *
 * Comments read chronologically (oldest→newest), but the DEFAULT window must be
 * the LATEST ones, so we fetch newest-first via the (createdAt, id) keyset and
 * reverse for display. A cursor means "older than this" — the "show earlier
 * comments" pager passes the oldest currently-shown comment's cursor to walk
 * backward in time. Fetches limit+1 to detect whether older comments remain.
 *
 * `nextCursor` therefore points at OLDER comments (not newer): it is non-null
 * whenever an earlier window exists.
 */
export async function getWorkCommentsPage(
  productId: string,
  req: PageRequest = {},
): Promise<Page<WorkCommentRow>> {
  const limit = clampLimit(req.limit);
  const cursor = req.cursor ? decodeCursor(req.cursor) : null;

  const rowsNewestFirst = await db
    .select({
      id: workComments.id,
      body: workComments.body,
      createdAt: workComments.createdAt,
      authorUserId: workComments.userId,
      authorName: user.name,
    })
    .from(workComments)
    .innerJoin(user, eq(user.id, workComments.userId))
    .where(
      cursor
        ? and(
            eq(workComments.productId, productId),
            or(
              lt(workComments.createdAt, cursor.createdAt),
              and(eq(workComments.createdAt, cursor.createdAt), lt(workComments.id, cursor.id)),
            ),
          )
        : eq(workComments.productId, productId),
    )
    .orderBy(desc(workComments.createdAt), desc(workComments.id))
    .limit(limit + 1);

  const hasOlder = rowsNewestFirst.length > limit;
  const windowNewestFirst = hasOlder ? rowsNewestFirst.slice(0, limit) : rowsNewestFirst;

  // The oldest comment in this window (last, since ordered DESC) is the cursor
  // for the next "show earlier" step.
  const oldest = windowNewestFirst[windowNewestFirst.length - 1];

  return {
    // Reverse to chronological (oldest→newest) for display.
    items: [...windowNewestFirst].reverse(),
    nextCursor: hasOlder && oldest ? encodeCursor(oldest.createdAt, oldest.id) : null,
  };
}

// Total comments on a work, for the heading count (the paged window can't
// report it). Single covering-index COUNT on (productId, createdAt).
export async function countWorkComments(productId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(workComments)
    .where(eq(workComments.productId, productId));
  return row?.value ?? 0;
}
