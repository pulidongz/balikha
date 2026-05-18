'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ACCEPTED_IMAGE_TYPES, uploadProductImage } from '@/lib/storage/upload-product-image';

export function ProductImageUploader({ productId }: { productId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      ref={formRef}
      className="space-y-3"
      action={(formData) => {
        setError(null);
        const file = formData.get('image');
        if (!(file instanceof File) || file.size === 0) {
          setError('Select an image to upload.');
          return;
        }
        startTransition(async () => {
          try {
            await uploadProductImage(productId, file);
            formRef.current?.reset();
            router.refresh();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'Upload failed.');
          }
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="product-image">Add an image (JPEG, PNG, WebP, or AVIF; up to 10 MB)</Label>
        <Input
          id="product-image"
          name="image"
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          required
          disabled={isPending}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending} variant="outline">
        {isPending ? 'Uploading…' : 'Upload image'}
      </Button>
    </form>
  );
}
