import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Returns a Pino child logger pre-tagged with the current request ID.
 * Call this at the top of any server action or server component that does
 * meaningful work — every subsequent log line carries the same `requestId`,
 * so a single log search reconstructs the entire request.
 *
 * The ID is set by `proxy.ts` on inbound requests (passing through Caddy's
 * `X-Request-Id` when present, otherwise minting a UUID). If neither path
 * ran (e.g. tests, or a plain script importing this file), we tag the
 * logger with `unknown` rather than throw — observability shouldn't break
 * the request.
 *
 * Use plain `logger` only for one-off scripts (seed, cleanup jobs) where
 * there is no request scope.
 */
export async function getRequestLogger() {
  const h = await headers();
  const requestId = h.get(REQUEST_ID_HEADER) ?? 'unknown';
  return logger.child({ requestId });
}
