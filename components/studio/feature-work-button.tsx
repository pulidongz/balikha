'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { setFeaturedProductAction } from '@/lib/actions/artisan';

// Owner-only pin control (T2). Renders under a work in the grid ("Feature")
// or on the featured tile ("Unpin"). One pinned work at a time — pinning a
// different work simply moves the pin.
export function FeatureWorkButton({
  productId,
  isFeatured,
}: {
  productId: string;
  isFeatured: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setFeaturedProductAction(isFeatured ? null : productId);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.refresh();
          });
        }}
      >
        {isPending ? 'Saving…' : isFeatured ? 'Unpin' : 'Feature'}
      </Button>
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
