'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteWorkCommentAction, reportWorkCommentAction } from '@/lib/actions/comments';

interface Props {
  commentId: string;
  canDelete: boolean;
  canReport: boolean;
}

// Quiet text affordances under each comment — moderation shouldn't shout
// louder than the conversation it moderates.
export function CommentItemActions({ commentId, canDelete, canReport }: Props) {
  const router = useRouter();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [reported, setReported] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleReport() {
    startTransition(async () => {
      const result = await reportWorkCommentAction({ commentId });
      if (result.ok) setReported(true);
    });
  }

  if (!canDelete && !canReport) return null;

  return (
    <span className="flex items-center gap-3">
      {canDelete && (
        <>
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-muted-foreground hover:text-destructive text-xs underline-offset-4 hover:underline"
          >
            Delete
          </button>
          <ConfirmDialog
            open={confirmingDelete}
            onOpenChange={setConfirmingDelete}
            title="Delete this comment?"
            description="The comment is removed for everyone. This cannot be undone."
            confirmLabel="Delete"
            pendingLabel="Deleting…"
            destructive
            onConfirm={() => deleteWorkCommentAction({ commentId })}
            onSuccess={() => router.refresh()}
          />
        </>
      )}
      {canReport &&
        (reported ? (
          <span className="text-muted-foreground text-xs">Reported — thank you.</span>
        ) : (
          <button
            type="button"
            onClick={handleReport}
            disabled={isPending}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
          >
            Report
          </button>
        ))}
    </span>
  );
}
