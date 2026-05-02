import { randomUUID } from 'node:crypto';
import { PUBLIC_URL_BASE } from './client';

// All product images live under products/<productId>/<uuid>.<ext>.
// The filename is a server-generated UUID — we never trust the client's
// filename as a key. This avoids path-traversal vectors and keeps keys
// predictable for bulk operations and ownership inference.
export function buildProductImageKey(productId: string, filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  const rawExt = lastDot >= 0 ? filename.slice(lastDot + 1) : 'bin';
  // Conservative: only [a-z0-9], 1–8 chars. Anything weird falls back to 'bin'.
  const ext = /^[a-z0-9]{1,8}$/i.test(rawExt) ? rawExt.toLowerCase() : 'bin';
  return `products/${productId}/${randomUUID()}.${ext}`;
}

export function publicUrlForKey(key: string): string {
  return `${PUBLIC_URL_BASE}/${key}`;
}
