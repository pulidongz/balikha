'use client';

import Image from 'next/image';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { deleteProductImageAction } from '@/lib/actions/product';

type ImageRow = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
  altText: string | null;
};

export function ProductImageList({ images }: { images: ImageRow[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (images.length === 0) {
    return <p className="text-muted-foreground text-sm">No images yet.</p>;
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      const result = await deleteProductImageAction(id);
      if (!result.ok) {
        console.error('deleteProductImageAction failed:', result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
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
            disabled={isPending}
            onClick={() => handleDelete(img.id)}
          >
            Remove
          </Button>
        </li>
      ))}
    </ul>
  );
}
