export interface PageRequest {
  cursor?: string | null;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  /** Pass to the next request to fetch the following page. null → end. */
  nextCursor: string | null;
}

export const DEFAULT_LIMIT = 24;
export const MAX_LIMIT = 60;

/**
 * Clamp a caller-supplied limit to a sane range. Callers should always
 * pipe `req.limit` through this — the URL is user input and we don't want
 * `?limit=10000` causing a full-table scan.
 */
export function clampLimit(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(requested)), MAX_LIMIT);
}
