'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { unblockBuyer } from '@/lib/actions/messaging';

// Lightweight Unblock affordance for the blocked-buyers settings list
// (§7.7). No confirmation dialog — the action is symmetric and easily
// reversible by re-blocking from the thread header. Errors are
// surfaced inline; success refreshes the list (the row disappears).
export function UnblockButton({ blockedUserId }: { blockedUserId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await unblockBuyer({ blockedUserId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
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
