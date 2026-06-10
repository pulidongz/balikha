// Early-platform rule (T12): never advertise emptiness. User-facing counts
// below this threshold are hidden entirely rather than rendered as e.g.
// "2 followers".
export const THIN_COUNT_THRESHOLD = 5;

export function isThinCount(count: number): boolean {
  return count < THIN_COUNT_THRESHOLD;
}
