// Suggest a corrected email when the domain is exactly one edit away from a
// common provider, where "one edit" is Optimal String Alignment distance — so a
// single adjacent transposition (the most common typo, e.g. "gmial" ↔ "gmail")
// counts as one edit, not two. Returns null when the address is already
// valid-looking, the domain is unknown, or the input is malformed — never
// guesses beyond distance 1. The local part is preserved verbatim; only the
// domain is corrected (and compared case-insensitively).

const COMMON_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'proton.me',
] as const;

// Optimal String Alignment distance — like Levenshtein but also counts
// adjacent transpositions (e.g. "gmial" ↔ "gmail") as a single edit.
function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dist[i]![0] = i;
  for (let j = 0; j < cols; j++) dist[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i]![j] = Math.min(
        dist[i - 1]![j]! + 1,
        dist[i]![j - 1]! + 1,
        dist[i - 1]![j - 1]! + cost,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dist[i]![j] = Math.min(dist[i]![j]!, dist[i - 2]![j - 2]! + cost);
      }
    }
  }
  return dist[rows - 1]![cols - 1]!;
}

export function suggestEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (COMMON_DOMAINS.includes(domain as (typeof COMMON_DOMAINS)[number])) return null;
  for (const candidate of COMMON_DOMAINS) {
    if (editDistance(domain, candidate) === 1) return `${local}@${candidate}`;
  }
  return null;
}
