// Server-only check for disposable / throwaway email domains.
// Backed by the `disposable-email-domains` package (~3500 domains).
// Imported by the Better Auth databaseHooks hook in lib/auth.ts AND
// by the checkDisposableEmail server action in lib/actions/auth.ts.
// NOT imported by any client component — the action keeps the JSON
// list off the client bundle (~20KB gzipped saved per /sign-up visit).

import disposableDomains from 'disposable-email-domains';

// Fail loud if the import didn't resolve to a string[]. If it ever resolves
// to a namespace wrapper, new Set(...) would silently produce an empty set
// and isDisposableEmail would return false for everything — disposable emails
// accepted with no error. A startup throw makes that a visible crash instead.
// (If this throws after install, switch to `import * as disposableDomains`.)
if (!Array.isArray(disposableDomains)) {
  throw new Error(
    'disposable-email-domains did not resolve to a string[] — check the import shape (default vs `import *`).',
  );
}

// Set lookup is O(1) — building once per process avoids per-call Array#includes.
const DISPOSABLE_SET = new Set<string>(disposableDomains);

export function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at === -1) return false; // Not our concern here — Zod / Better Auth shape-validate the address first
  // strip a trailing dot — user@x.com. is DNS-equivalent to user@x.com
  const domain = email
    .slice(at + 1)
    .toLowerCase()
    .replace(/\.$/, '');
  return DISPOSABLE_SET.has(domain);
}
