// Per-IP sliding-window rate limiter for the public /search page (E7).
//
// Search is well-built (FTS + GIN, trigram fallback, keyset pagination) and
// handles real load fine; the gap is a script hammering uncached queries
// against the single 1GB Linode. This caps each IP to a sane burst.
//
// In-memory + process-local BY DESIGN: the deployment is a single Node
// instance (see deployment-topology). State does NOT survive a deploy and
// is NOT shared across instances — if we ever scale horizontally this must
// move to a shared store (Postgres/Redis). Documented limitation, not an
// oversight.

const WINDOW_MS = 60_000;
// 30 searches/minute/IP. A human refining a query never approaches this;
// a scraper looping uncached queries trips it immediately.
const MAX_REQUESTS_PER_WINDOW = 30;
// Bound the map so a flood of distinct (possibly spoofed) IPs can't grow
// it without limit. Past this, entries whose window has fully elapsed are
// swept — they'd reset to empty anyway.
const MAX_TRACKED_IPS = 10_000;

// ip → ascending request timestamps within the current window.
const hits = new Map<string, number[]>();

export interface RateLimitResult {
  allowed: boolean;
  /** Milliseconds until the oldest in-window hit expires (0 when allowed). */
  retryAfterMs: number;
}

/**
 * Record a request from `ip` and report whether it's within the limit.
 * Call once per rate-limited request; it both checks AND records.
 */
export function checkSearchRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const recent = (hits.get(ip) ?? []).filter((t) => t > windowStart);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    // Keep the pruned list so the window keeps sliding accurately.
    hits.set(ip, recent);
    return { allowed: false, retryAfterMs: recent[0]! + WINDOW_MS - now };
  }

  recent.push(now);
  hits.set(ip, recent);

  if (hits.size > MAX_TRACKED_IPS) {
    for (const [key, timestamps] of hits) {
      const last = timestamps[timestamps.length - 1];
      if (last === undefined || last <= windowStart) hits.delete(key);
    }
  }

  return { allowed: true, retryAfterMs: 0 };
}
