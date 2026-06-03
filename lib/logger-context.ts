import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

const REQUEST_ID_HEADER = 'x-request-id';
// Caddy sets X-Real-IP on the origin request (from the trusted Cf-Connecting-Ip
// value behind Cloudflare; the direct client when grey-cloud); it reaches here
// as an inbound header via `next/headers` (proxy.ts passes inbound headers
// through unchanged).
const CLIENT_IP_HEADER = 'x-real-ip';

/**
 * Returns a Pino child logger pre-tagged with the current request ID and
 * client IP. Call this at the top of any server action or server component
 * that does meaningful work — every subsequent log line carries the same
 * `requestId` and `ip`, so a single log search reconstructs the request and
 * attributes it to a visitor.
 *
 * The request ID is set by `proxy.ts`; the IP is set by Caddy as X-Real-IP.
 * If either is absent (e.g. tests, or a plain script importing this file),
 * we tag `unknown` rather than throw — observability shouldn't break the
 * request.
 *
 * Use plain `logger` only for one-off scripts (seed, cleanup jobs) where
 * there is no request scope.
 */
export async function getRequestLogger() {
  const h = await headers();
  const requestId = h.get(REQUEST_ID_HEADER) ?? 'unknown';
  const ip = h.get(CLIENT_IP_HEADER) ?? 'unknown';
  return logger.child({ requestId, ip });
}
