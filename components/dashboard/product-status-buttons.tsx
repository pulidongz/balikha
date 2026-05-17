'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { setProductStatusAction } from '@/lib/actions/product';

type Status = 'draft' | 'published' | 'sold_out' | 'archived';

export function ProductStatusButtons({ productId, status }: { productId: string; status: Status }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  function setStatus(next: Status) {
    setError(null);
    startTransition(async () => {
      const result = await setProductStatusAction(productId, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status !== 'published' && (
          <Button size="sm" onClick={() => setStatus('published')} disabled={isPending}>
            Publish
          </Button>
        )}
        {status !== 'draft' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setStatus('draft')}
            disabled={isPending}
          >
            Move to draft
          </Button>
        )}
        {status !== 'sold_out' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setStatus('sold_out')}
            disabled={isPending}
          >
            Sold out
          </Button>
        )}
        {status !== 'archived' && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setArchiveOpen(true)}
            disabled={isPending}
          >
            Archive
          </Button>
        )}
      </div>
      {error && (
        <p className="text-destructive bg-destructive/10 rounded-md p-2 text-sm" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        title="Archive this product?"
        description="Archiving takes the product off your storefront, so buyers can no longer see or order it. You can move it back to draft anytime."
        confirmLabel="Archive product"
        pendingLabel="Archiving…"
        onConfirm={() => setProductStatusAction(productId, 'archived')}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
