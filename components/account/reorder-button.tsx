'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { reorderAction } from '@/lib/actions/orders';
import { workPath } from '@/lib/routes';

// "Reorder" doesn't put anything into a cart — there's no cart in this
// model. Instead, it routes the buyer back to the live product page
// with `?reorder=1`, which auto-opens the order dialog with a fresh
// address selection. The page-level dialog handles the rest.
//
// `disabled` is set by the caller when the underlying product no longer
// exists (productId on the order row is null after ON DELETE SET NULL).
// The server action also returns a clean error in that case, so this
// is a UX nicety, not a security gate.
export function ReorderButton({
  orderId,
  disabled = false,
}: {
  orderId: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    startTransition(async () => {
      const result = await reorderAction({ orderId });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(`${workPath(result.data.artisanSlug, result.data.productSlug)}?reorder=1`);
    });
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button
        type="button"
        variant="outline"
        onClick={handleClick}
        disabled={disabled || pending}
        title={disabled ? 'This piece is no longer available' : undefined}
      >
        {pending ? 'Loading…' : 'Reorder'}
      </Button>
      {error && (
        <p className="text-destructive text-xs" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
