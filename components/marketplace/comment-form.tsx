'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { postWorkCommentAction } from '@/lib/actions/comments';
import { COMMENT_MAX_LENGTH } from '@/lib/comments/constants';

export function CommentForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await postWorkCommentAction({ productId, body });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setBody('');
      // The page is dynamic — refresh re-renders the server list with the
      // new comment included.
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={COMMENT_MAX_LENGTH}
        rows={3}
        placeholder="Ask about the glaze, the wood, the process…"
        aria-label="Write a comment"
      />
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-xs">
          {body.length}/{COMMENT_MAX_LENGTH}
        </span>
        <Button type="submit" disabled={isPending || body.trim().length === 0}>
          {isPending ? 'Posting…' : 'Post comment'}
        </Button>
      </div>
    </form>
  );
}
