'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadProductImagesAction } from '@/lib/actions/product';

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
        startTransition(async () => {
          const result = await uploadProductImagesAction(productId, formData);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          formRef.current?.reset();
          router.refresh();
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="product-images">Add images (PNG, JPEG, WebP, GIF; up to 10 MB each)</Label>
        <Input
          id="product-images"
          name="images"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          required
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" disabled={isPending} variant="outline">
        {isPending ? 'Uploading…' : 'Upload images'}
      </Button>
    </form>
  );
}
