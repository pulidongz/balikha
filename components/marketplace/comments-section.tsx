import Link from 'next/link';
import { formatRelativeTime } from '@/lib/format';
import { countWorkComments, getWorkCommentsPage } from '@/lib/queries/comments';
import { isThinCount } from '@/lib/thin-count';
import { CommentForm } from './comment-form';
import { CommentItemActions } from './comment-item-actions';

interface Props {
  productId: string;
  /** Path back to this work, used as the sign-in `next` target and pager base. */
  workPathname: string;
  viewerUserId: string | null;
  /** The artist who owns this work — may delete any comment on it. */
  ownerUserId: string;
  /** `?comments=` cursor: when set, this is an older (paged-back) window. */
  cursor?: string | null;
}

// Flat, chronological conversation under a work (T8). Server component: the list
// renders with the page; the form and per-comment actions are small client
// islands that router.refresh() after mutating. Paged via a `?comments=` cursor
// (T#127): the default window is the LATEST comments; "show earlier comments"
// walks backward in time by full-page navigation, matching the browse/feed pager.
export async function CommentsSection({
  productId,
  workPathname,
  viewerUserId,
  ownerUserId,
  cursor = null,
}: Props) {
  const [page, total] = await Promise.all([
    getWorkCommentsPage(productId, { cursor }),
    countWorkComments(productId),
  ]);
  const comments = page.items;
  const isPagedBack = Boolean(cursor);

  return (
    <section id="comments" aria-label="Comments" className="space-y-6 border-t pt-8">
      <h2 className="font-serif text-2xl tracking-tight">
        Conversation
        {/* Thin-count rule (T12): the list shows itself; the numeral joins once
            it stops underlining how quiet things are. Uses the true total, not
            the current window. */}
        {!isThinCount(total) && (
          <span className="text-muted-foreground ml-2 text-base">{total}</span>
        )}
      </h2>

      {total === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing here yet. Be the first to ask about the glaze, the weave, the process.
        </p>
      ) : (
        <>
          {/* Pager nav sits above the list — "earlier" comments are older. */}
          {(page.nextCursor || isPagedBack) && (
            <div className="flex items-center justify-between text-sm">
              {page.nextCursor ? (
                <Link
                  href={`${workPathname}?comments=${page.nextCursor}#comments`}
                  className="text-foreground underline underline-offset-4"
                >
                  Show earlier comments
                </Link>
              ) : (
                <span />
              )}
              {isPagedBack && (
                <Link
                  href={`${workPathname}#comments`}
                  className="text-muted-foreground underline underline-offset-4"
                >
                  Back to latest
                </Link>
              )}
            </div>
          )}

          <ul className="space-y-5">
            {comments.map((c) => (
              <li key={c.id} className="space-y-1">
                <p className="text-sm">
                  <span className="font-medium">{c.authorName}</span>
                  <span className="text-muted-foreground">
                    {' '}
                    · {formatRelativeTime(c.createdAt)}
                  </span>
                </p>
                <p className="text-base leading-relaxed whitespace-pre-line">{c.body}</p>
                <CommentItemActions
                  commentId={c.id}
                  canDelete={viewerUserId === c.authorUserId || viewerUserId === ownerUserId}
                  canReport={viewerUserId !== null && viewerUserId !== c.authorUserId}
                />
              </li>
            ))}
          </ul>
        </>
      )}

      {viewerUserId ? (
        // The form posts a NEW (newest) comment and router.refresh()es, so only
        // offer it on the latest window — otherwise the refresh would reload an
        // older window and the new comment wouldn't be visible.
        isPagedBack ? (
          <p className="text-muted-foreground text-sm">
            <Link
              href={`${workPathname}#comments`}
              className="text-foreground underline underline-offset-4"
            >
              Back to latest
            </Link>{' '}
            to add a comment.
          </p>
        ) : (
          <CommentForm productId={productId} />
        )
      ) : (
        <p className="text-muted-foreground text-sm">
          <Link
            href={`/sign-in?next=${encodeURIComponent(workPathname)}`}
            className="text-foreground underline underline-offset-4"
          >
            Sign in
          </Link>{' '}
          to join the conversation.
        </p>
      )}
    </section>
  );
}
