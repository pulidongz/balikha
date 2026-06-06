import { randomUUID } from 'node:crypto';
import { PUBLIC_URL_BASE } from './client';

// All product images live under products/<productId>/<uuid>.<ext>.
// The ext parameter must be a bare, already-validated extension (e.g. "jpg",
// "png", "webp", "avif") — no leading dot. The caller is responsible for
// supplying a safe value; IMAGE_FORMAT_META[format].ext always satisfies this.
export function buildProductImageKey(productId: string, ext: string): string {
  return `products/${productId}/${randomUUID()}.${ext}`;
}

export function publicUrlForKey(key: string): string {
  return `${PUBLIC_URL_BASE}/${key}`;
}
