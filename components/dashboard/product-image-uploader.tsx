'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { confirmImageUploadAction, requestImageUploadAction } from '@/lib/actions/product-image';

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_BYTES = 10 * 1024 * 1024;

export function ProductImageUploader({ productId }: { productId: string }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function readDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new window.Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(objectUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Could not read image dimensions'));
      };
      img.src = objectUrl;
    });
  }

  async function uploadFile(file: File) {
    // Client-side preflight — server re-validates, this is just for fast UX feedback.
    if (!ACCEPTED_TYPES.includes(file.type)) {
      throw new Error('Only JPEG, PNG, WebP, or AVIF images are allowed.');
    }
    if (file.size > MAX_BYTES) {
      throw new Error('Image must be 10 MB or smaller.');
    }

    // 1. Ask the server for a presigned URL
    const presigned = await requestImageUploadAction({
      productId,
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    });
    if (!presigned.ok) throw new Error(presigned.error);

    // 2. PUT the file directly to S3-compatible storage. The Content-Type
    //    must match what we signed for or the storage layer rejects it.
    const putResponse = await fetch(presigned.data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type },
      body: file,
    });
    if (!putResponse.ok) throw new Error(`Upload to storage failed (${putResponse.status})`);

    // 3. Read pixel dimensions client-side. Avoids round-tripping bytes
    //    through our backend just to call image-size.
    const dims = await readDimensions(file);

    // 4. Confirm with the server — server re-checks ownership + key prefix
    //    and inserts the product_images row.
    const confirmed = await confirmImageUploadAction({
      productId,
      key: presigned.data.key,
      width: dims.width,
      height: dims.height,
    });
    if (!confirmed.ok) throw new Error(confirmed.error);
  }

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
            await uploadFile(file);
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
          accept={ACCEPTED_TYPES.join(',')}
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
