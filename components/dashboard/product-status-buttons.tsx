'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { setProductStatusAction } from '@/lib/actions/product';

type Status = 'draft' | 'published' | 'sold_out' | 'archived';

export function ProductStatusButtons({ productId, status }: { productId: string; status: Status }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setStatus(next: Status) {
    startTransition(async () => {
      const result = await setProductStatusAction(productId, next);
      if (!result.ok) {
        console.error('setProductStatusAction failed:', result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {status !== 'published' && (
        <Button size="sm" onClick={() => setStatus('published')} disabled={isPending}>
          Publish
        </Button>
      )}
      {status !== 'draft' && (
        <Button size="sm" variant="outline" onClick={() => setStatus('draft')} disabled={isPending}>
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
          onClick={() => setStatus('archived')}
          disabled={isPending}
        >
          Archive
        </Button>
      )}
    </div>
  );
}
