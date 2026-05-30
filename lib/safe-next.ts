// Returns `next` only if it's a same-origin path (leading single `/`, no
// protocol-relative `//` or backslash trick, and only safe path/query chars).
// Blocks the open-redirect vector where ?next=https://evil.example would send
// the user off-site. Falls back to `fallback` otherwise.
export function safeNextOr(next: string | null, fallback: string): string {
  if (!next) return fallback;
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (!/^[A-Za-z0-9_\-/?&=.+,#]*$/.test(next.slice(1))) return fallback;
  return next;
}
