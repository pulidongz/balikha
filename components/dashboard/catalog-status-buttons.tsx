'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { setCatalogStatusAction } from '@/lib/actions/catalog';

type Status = 'draft' | 'published' | 'archived';

export function CatalogStatusButtons({ catalogId, status }: { catalogId: string; status: Status }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);

  function setStatus(next: Status) {
    setError(null);
    startTransition(async () => {
      const result = await setCatalogStatusAction(catalogId, next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
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
        title="Archive this catalog?"
        description="Archiving takes this catalog off your storefront. Its products stay in your dashboard, but the collection is no longer public. You can move it back to draft anytime."
        confirmLabel="Archive catalog"
        pendingLabel="Archiving…"
        onConfirm={() => setCatalogStatusAction(catalogId, 'archived')}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
