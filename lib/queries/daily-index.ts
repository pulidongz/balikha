// Pure helpers for the auth panel's daily artist rotation. No DB or Next deps
// so they unit-test in isolation.

// Today's date as YYYY-MM-DD in Asia/Manila, so the daily pick flips at PH
// midnight rather than UTC. en-CA formats as YYYY-MM-DD. (Asia/Manila has no
// DST, so the offset is a constant +08:00.)
export function manilaDateKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// FNV-1a 32-bit hash of `${dateKey}:${id}` → unsigned 32-bit score.
function scoreKey(dateKey: string, id: string): number {
  const s = `${dateKey}:${id}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

// Rendezvous (highest-random-weight) hashing: pick the id whose score is
// highest for this date. Each id's score depends only on (dateKey, id) — NOT on
// how many ids there are — so an unrelated id appearing or leaving never
// changes the winner. Stable within a day, ~uniform across ids over time.
export function dailyPick(dateKey: string, ids: string[]): string {
  let bestId: string | undefined;
  let bestScore = -1;
  for (const id of ids) {
    const score = scoreKey(dateKey, id);
    // Deterministic tie-break by id so equal scores are stable and
    // order-independent.
    if (bestId === undefined || score > bestScore || (score === bestScore && id > bestId)) {
      bestScore = score;
      bestId = id;
    }
  }
  if (bestId === undefined) {
    throw new Error('dailyPick requires at least one id');
  }
  return bestId;
}
