'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { deleteProductImageAction } from '@/lib/actions/product';
import { err } from '@/lib/result';

export type ImageRow = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  altText: string | null;
};

export function ProductImageList({ images }: { images: ImageRow[] }) {
  const router = useRouter();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  if (images.length === 0) {
    return <p className="text-muted-foreground text-sm">No images yet.</p>;
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {images.map((img) => (
          <li key={img.id} className="space-y-2 rounded-md border p-2">
            <div className="bg-muted relative aspect-square overflow-hidden rounded">
              <Image
                src={img.url}
                alt={img.altText ?? ''}
                fill
                sizes="(min-width: 640px) 200px, 50vw"
                className="object-cover"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => setPendingDeleteId(img.id)}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
        title="Remove this image?"
        description="The photo is how buyers see this piece. Removing it takes the image off the listing for good and cannot be undone."
        confirmLabel="Remove image"
        pendingLabel="Removing…"
        destructive
        onConfirm={async () => {
          if (pendingDeleteId === null) {
            return err('No image selected.');
          }
          return deleteProductImageAction(pendingDeleteId);
        }}
        onSuccess={() => {
          setPendingDeleteId(null);
          router.refresh();
        }}
      />
    </>
  );
}
