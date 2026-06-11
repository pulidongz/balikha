'use client';

import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { setDigestEmailPreferenceAction } from '@/lib/actions/digest-preference';

// Optimistic on/off for the weekly digest email (T10). Mirrors the
// unsubscribe link's effect; both write the same opt-out row.
export function DigestPreferenceToggle({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [isPending, startTransition] = useTransition();

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const result = await setDigestEmailPreferenceAction({ enabled: next });
      if (!result.ok) setEnabled(!next);
    });
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="font-medium">Weekly digest email</p>
        <p className="text-muted-foreground text-sm">
          A summary of new followers, appreciations, comments, and conversations. Quiet weeks send
          nothing.
        </p>
      </div>
      <Button
        type="button"
        variant={enabled ? 'secondary' : 'outline'}
        onClick={handleToggle}
        disabled={isPending}
        aria-pressed={enabled}
      >
        {enabled ? 'On' : 'Off'}
      </Button>
    </div>
  );
}
