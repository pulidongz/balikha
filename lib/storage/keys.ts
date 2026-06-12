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

// Artisan profile assets: artisans/<profileId>/<kind>-<uuid>.<ext>.
// kind is a fixed literal (never user input) so keys stay enumerable.
export function buildArtisanAssetKey(
  profileId: string,
  kind: 'banner' | 'profile-photo',
  ext: string,
): string {
  return `artisans/${profileId}/${kind}-${randomUUID()}.${ext}`;
}

// Buyer avatars: users/<userId>/avatar-<uuid>.<ext>.
export function buildUserAvatarKey(userId: string, ext: string): string {
  return `users/${userId}/avatar-${randomUUID()}.${ext}`;
}

// Studio update photos: updates/<profileId>/<uuid>.<ext>.
export function buildUpdatePhotoKey(profileId: string, ext: string): string {
  return `updates/${profileId}/${randomUUID()}.${ext}`;
}

// Inverse of publicUrlForKey: the storage key for a URL we own, or null
// for anything else (seeded external URLs, legacy local /uploads/ paths
// from the pre-S3 era in dev databases). null means "not ours to delete"
// — callers skip deletion explicitly rather than guessing.
export function keyForPublicUrl(url: string): string | null {
  const prefix = `${PUBLIC_URL_BASE}/`;
  if (!url.startsWith(prefix)) return null;
  return url.slice(prefix.length);
}
