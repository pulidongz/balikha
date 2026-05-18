'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ACCEPTED_IMAGE_TYPES, uploadProductImage } from '@/lib/storage/upload-product-image';

// A non-form control so it can be embedded inside ProductForm's <form> without
// nesting forms. The file is read from a ref; the Upload button is
// type="button" and triggers the upload via onClick.
export function ProductImageUploader({ productId }: { productId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleUpload() {
    setError(null);
    const file = inputRef.current?.files?.[0];
    if (!file || file.size === 0) {
      setError('Select an image to upload.');
      return;
    }
    startTransition(async () => {
      try {
        await uploadProductImage(productId, file);
        if (inputRef.current) inputRef.current.value = '';
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.');
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="product-image">Add an image (JPEG, PNG, WebP, or AVIF; up to 10 MB)</Label>
        <Input
          id="product-image"
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          disabled={isPending}
        />
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="button" onClick={handleUpload} disabled={isPending} variant="outline">
        {isPending ? 'Uploading…' : 'Upload image'}
      </Button>
    </div>
  );
}
