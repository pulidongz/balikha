'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { unblockSeller } from '@/lib/actions/messaging';

// Lightweight Unblock affordance for the buyer's blocked-makers list at
// /account/blocked. No confirmation dialog — the action is symmetric
// and easily reversible by re-blocking from the thread header. Errors
// are surfaced inline; success refreshes the list (the row disappears).
export function UnblockSellerButton({ artisanProfileId }: { artisanProfileId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await unblockSeller({ blockedArtisanProfileId: artisanProfileId });
        if (!result.ok) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError('Something went wrong. Please try again in a moment.');
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" size="sm" onClick={handleClick} disabled={pending}>
        {pending ? 'Unblocking…' : 'Unblock'}
      </Button>
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
