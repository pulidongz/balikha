'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { resolveFeedbackAction } from '@/lib/actions/feedback';

export function FeedbackActions({ feedbackId }: { feedbackId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function resolve() {
    setError(null);
    startTransition(async () => {
      const result = await resolveFeedbackAction({ feedbackId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" variant="outline" onClick={resolve} disabled={isPending}>
        {isPending ? 'Working…' : 'Mark resolved'}
      </Button>
      {error && (
        <span role="alert" className="text-destructive text-xs">
          {error}
        </span>
      )}
    </span>
  );
}
