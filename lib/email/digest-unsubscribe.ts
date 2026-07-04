import { createHmac, hkdfSync, timingSafeEqual } from 'node:crypto';
import { env } from '@/env';

// Derive a dedicated key for unsubscribe-link signing from the app secret
// via HKDF with a domain-separation label, instead of using
// BETTER_AUTH_SECRET directly. A leak of this derived key cannot reveal
// BETTER_AUTH_SECRET (HKDF is one-way), so unsubscribe signing and session
// signing no longer share a key. NOTE: the key is still DERIVED from
// BETTER_AUTH_SECRET, so rotating that secret still invalidates
// previously-issued unsubscribe links.
const UNSUBSCRIBE_KEY = Buffer.from(
  hkdfSync('sha256', env.BETTER_AUTH_SECRET, '', 'balikha:digest-unsubscribe:v1', 32),
);

// Stateless unsubscribe tokens: HMAC of the user id under the derived key.
// No expiry by design — an unsubscribe link in an old email should keep
// working forever.
export function digestUnsubscribeToken(userId: string): string {
  return createHmac('sha256', UNSUBSCRIBE_KEY).update(`digest-unsubscribe:${userId}`).digest('hex');
}

export function verifyDigestUnsubscribeToken(userId: string, token: string): boolean {
  const expected = Buffer.from(digestUnsubscribeToken(userId));
  const provided = Buffer.from(token);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
