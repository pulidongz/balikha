'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { setCatalogStatusAction } from '@/lib/actions/catalog';

type Status = 'draft' | 'published' | 'archived';

export function CatalogStatusButtons({ catalogId, status }: { catalogId: string; status: Status }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function setStatus(next: Status) {
    startTransition(async () => {
      const result = await setCatalogStatusAction(catalogId, next);
      if (!result.ok) {
        console.error('setCatalogStatusAction failed:', result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex gap-2">
      {status !== 'published' && (
        <Button
          size="sm"
          variant="default"
          onClick={() => setStatus('published')}
          disabled={isPending}
        >
          Publish
        </Button>
      )}
      {status !== 'draft' && (
        <Button size="sm" variant="outline" onClick={() => setStatus('draft')} disabled={isPending}>
          Move to draft
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
