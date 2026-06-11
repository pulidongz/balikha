import Link from 'next/link';
import { formatRelativeTime } from '@/lib/format';
import { getWorkComments } from '@/lib/queries/comments';
import { isThinCount } from '@/lib/thin-count';
import { CommentForm } from './comment-form';
import { CommentItemActions } from './comment-item-actions';

interface Props {
  productId: string;
  /** Path back to this work, used as the sign-in `next` target. */
  workPathname: string;
  viewerUserId: string | null;
  /** The artist who owns this work — may delete any comment on it. */
  ownerUserId: string;
}

// Flat, chronological conversation under a work (T8). Server component:
// the list renders with the page; the form and per-comment actions are
// small client islands that router.refresh() after mutating.
export async function CommentsSection({
  productId,
  workPathname,
  viewerUserId,
  ownerUserId,
}: Props) {
  const comments = await getWorkComments(productId);

  return (
    <section aria-label="Comments" className="space-y-6 border-t pt-8">
      <h2 className="font-serif text-2xl tracking-tight">
        Conversation
        {/* Thin-count rule (T12): the list shows itself; the numeral
            joins once it stops underlining how quiet things are. */}
        {!isThinCount(comments.length) && (
          <span className="text-muted-foreground ml-2 text-base">{comments.length}</span>
        )}
      </h2>

      {comments.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nothing here yet — be the first to ask about the glaze, the weave, the process.
        </p>
      ) : (
        <ul className="space-y-5">
          {comments.map((c) => (
            <li key={c.id} className="space-y-1">
              <p className="text-sm">
                <span className="font-medium">{c.authorName}</span>
                <span className="text-muted-foreground"> · {formatRelativeTime(c.createdAt)}</span>
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
      )}

      {viewerUserId ? (
        <CommentForm productId={productId} />
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
