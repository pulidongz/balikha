'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { removeReportedCommentAction, resolveCommentReportAction } from '@/lib/actions/comments';

// Two remedies for a reported comment: Dismiss (resolve the report, leave the
// comment) and Remove (delete the comment + resolve). Remove is destructive so
// it takes a second confirming click rather than firing on the first.
export function CommentReportActions({ reportId }: { reportId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [isPending, startTransition] = useTransition();

  function dismiss() {
    setError(null);
    startTransition(async () => {
      const result = await resolveCommentReportAction({ reportId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function remove() {
    setError(null);
    startTransition(async () => {
      const result = await removeReportedCommentAction({ reportId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex flex-wrap items-center justify-end gap-2">
        {confirmingRemove ? (
          <>
            <span className="text-muted-foreground text-xs">Delete this comment?</span>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={remove}
              disabled={isPending}
            >
              {isPending ? 'Removing…' : 'Confirm remove'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirmingRemove(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={dismiss}
              disabled={isPending}
            >
              {isPending ? 'Working…' : 'Dismiss'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              onClick={() => setConfirmingRemove(true)}
              disabled={isPending}
            >
              Remove comment
            </Button>
          </>
        )}
      </span>
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </span>
  );
}
