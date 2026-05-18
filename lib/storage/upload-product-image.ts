// Client-side orchestration for uploading one product image: validate, request
// a presigned URL, PUT the file to storage, read its pixel dimensions, then
// confirm. Used by the create form (ProductForm) and the product-page uploader
// (ProductImageUploader). Browser-only — uses fetch, Image, and URL.

import { confirmImageUploadAction, requestImageUploadAction } from '@/lib/actions/product-image';

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

// Returns a human-readable problem, or null if the file passes the preflight.
export function validateImageFile(file: File): string | null {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return 'Only JPEG, PNG, WebP, or AVIF images are allowed.';
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return 'Image must be 10 MB or smaller.';
  }
  return null;
}

function readDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not read image dimensions'));
    };
    img.src = objectUrl;
  });
}

// Uploads one image to one product. Throws an Error on any failure.
export async function uploadProductImage(productId: string, file: File): Promise<void> {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);

  const presigned = await requestImageUploadAction({
    productId,
    filename: file.name,
    contentType: file.type,
    sizeBytes: file.size,
  });
  if (!presigned.ok) throw new Error(presigned.error);

  const putResponse = await fetch(presigned.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!putResponse.ok) throw new Error(`Upload to storage failed (${putResponse.status})`);

  const dims = await readDimensions(file);

  const confirmed = await confirmImageUploadAction({
    productId,
    key: presigned.data.key,
    width: dims.width,
    height: dims.height,
  });
  if (!confirmed.ok) throw new Error(confirmed.error);
}
