import { z } from 'zod';

/**
 * Optional client-supplied idempotency key.
 *
 * Forms generate a UUID once at mount via `useState(() => crypto.randomUUID())`
 * and include it on every submission attempt. The server uses
 * `withIdempotency()` to dedup retries within a 24-hour window.
 *
 * Validated as a UUID specifically so a forged or malformed key is
 * rejected at parse time (rather than getting cached as some weird value
 * that no future request can collide with).
 */
export const idempotencyKeyField = z.string().uuid().optional();
