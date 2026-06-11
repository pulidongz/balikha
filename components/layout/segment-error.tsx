'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
  /** Surface-specific first line, in the brand voice. */
  title?: string;
}

// Shared body for the route-segment error boundaries (E2). Calm, branded,
// with a retry that actually retries (Next re-renders the segment).
export function SegmentError({ error, reset, title = 'Something broke on our side.' }: Props) {
  useEffect(() => {
    // Surface in monitoring; the user already sees the friendly version.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <h1 className="font-serif text-2xl tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
        It isn&rsquo;t you. Give it another go — and if it keeps happening, we&rsquo;d like to know.
      </p>
      {error.digest && (
        <p className="text-muted-foreground mt-2 font-mono text-xs">ref: {error.digest}</p>
      )}
      <div className="mt-6">
        <Button type="button" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
