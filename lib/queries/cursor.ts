import { z } from 'zod';

// Compact field names (`c`, `i`) — cursor strings end up in URLs and we
// don't need verbose JSON keys. Schema validates the shape on decode so a
// tampered/malformed cursor returns null instead of throwing.
const cursorSchema = z.object({
  c: z.string(), // ISO timestamp of the last seen row's createdAt
  i: z.string(), // last seen row's id (tiebreaker for same-millisecond rows)
});

/**
 * Encode a (createdAt, id) pair as a base64url cursor.
 *
 * The id tiebreaker matters: rows inserted in the same millisecond would
 * otherwise alternate appearing on consecutive pages, because a sort by
 * createdAt alone is non-deterministic across them.
 */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ c: createdAt.toISOString(), i: id })).toString('base64url');
}

/**
 * Decode a base64url cursor. Returns null on malformed input — callers
 * should treat null as "start from page 1" rather than throwing, which
 * keeps tampered URLs from producing 500s.
 */
export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8'));
    const parsed = cursorSchema.parse(decoded);
    const date = new Date(parsed.c);
    if (Number.isNaN(date.getTime())) return null;
    return { createdAt: date, id: parsed.i };
  } catch {
    return null;
  }
}
