// Canonical conversions between structured first/last names and Better Auth's
// single required `name` field. composeName is the ONLY place first+last
// becomes the display name — keep all call sites going through it.

export function composeName(firstName: string, lastName: string | null | undefined): string {
  const first = firstName.trim();
  const last = (lastName ?? '').trim();
  return last ? `${first} ${last}` : first;
}

// Best-effort split of an existing full name into first + (whole) last.
// Used for the one-time migration backfill of legacy `name`-only rows and as
// the Google fallback when `family_name` is absent. First whitespace token is
// the first name; everything after is the surname (kept whole so
// "de los Santos" is not mangled).
export function splitFullName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;
  return { firstName, lastName };
}
