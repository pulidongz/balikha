import { and, eq, lt, or, type AnyColumn, type SQL } from 'drizzle-orm';

export interface PageRequest {
  cursor?: string | null;
  limit?: number;
}

export interface Page<T> {
  items: T[];
  /** Pass to the next request to fetch the following page. null → end. */
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

/**
 * Keyset predicate for "rows strictly before this cursor" under a
 * `ORDER BY createdAt DESC, id DESC` scan:
 *
 *   createdAt < cursor.createdAt
 *   OR (createdAt = cursor.createdAt AND id < cursor.id)
 *
 * The id tiebreaker makes same-timestamp rows deterministic across pages. AND
 * this with the query's base predicate: `and(baseFilter, keysetBefore(...))`.
 * Centralised so this correctness-critical boilerplate (a wrong `lt`/tiebreaker
 * silently skips or duplicates rows) is written once, not per query.
 */
export function keysetBefore(
  createdAtCol: AnyColumn,
  idCol: AnyColumn,
  cursor: { createdAt: Date; id: string },
): SQL | undefined {
  return or(
    lt(createdAtCol, cursor.createdAt),
    and(eq(createdAtCol, cursor.createdAt), lt(idCol, cursor.id)),
  );
}

/**
 * Clamp a caller-supplied limit to a sane range. Callers should always
 * pipe `req.limit` through this — the URL is user input and we don't want
 * `?limit=10000` causing a full-table scan.
 */
export function clampLimit(requested: number | undefined): number {
  if (!requested || !Number.isFinite(requested)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(requested)), MAX_LIMIT);
}
