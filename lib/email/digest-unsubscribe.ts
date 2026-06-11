import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@/env';

// Stateless unsubscribe tokens: HMAC of the user id under the app secret.
// No expiry by design — an unsubscribe link in an old email should keep
// working forever.
export function digestUnsubscribeToken(userId: string): string {
  return createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(`digest-unsubscribe:${userId}`)
    .digest('hex');
}

export function verifyDigestUnsubscribeToken(userId: string, token: string): boolean {
  const expected = Buffer.from(digestUnsubscribeToken(userId));
  const provided = Buffer.from(token);
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}
