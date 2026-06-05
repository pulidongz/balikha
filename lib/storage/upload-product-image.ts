// Client-side orchestration for uploading one product image. Posts the file to
// the server-proxied Route Handler (/api/uploads/product-image), which is the
// real validation boundary: it re-reads the bytes, validates the actual format,
// strips EXIF, stores the sanitized image, and records the row. The client-side
// validateImageFile() below is a preflight UX nicety only (fail-fast on the
// obvious bad cases) — the server does not trust it.
//
// Used by the create form (ProductForm) and the product-page uploader
// (ProductImageUploader).

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

// Uploads one image to one product. Throws an Error on any failure; the thrown
// message is the server's rejection reason, which both consumers surface in
// their error UI.
export async function uploadProductImage(productId: string, file: File): Promise<void> {
  const problem = validateImageFile(file);
  if (problem) throw new Error(problem);

  const body = new FormData();
  body.append('file', file);
  body.append('productId', productId);

  const response = await fetch('/api/uploads/product-image', {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    const message = await response
      .json()
      .then((data: { error?: string }) => data.error)
      .catch(() => null);
    throw new Error(message ?? `Upload failed (${response.status})`);
  }
}
