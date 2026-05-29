// Server-only check for disposable / throwaway email domains.
// Backed by the `disposable-email-domains` package (~3500 domains).
// Imported by the Better Auth databaseHooks hook in lib/auth.ts AND
// by the checkDisposableEmail server action in lib/actions/auth.ts.
// NOT imported by any client component — the action keeps the JSON
// list off the client bundle (~20KB gzipped saved per /sign-up visit).

import disposableDomains from 'disposable-email-domains';

// ★ Round-3 (Issue 3): fail LOUD if the import didn't resolve to the
// expected string[]. The package's main is a JSON array; under this repo's
// bundler resolution + esModuleInterop the default import should be the
// array, but if it ever resolves to a namespace wrapper, new Set(...) would
// silently build an empty/useless set and isDisposableEmail would return
// false for EVERYTHING — AC4 fails open (disposable emails accepted) while
// still passing `npm run check`. A startup throw turns that silent
// fail-open into an obvious crash. (If this throws after install, switch to
// `import * as disposableDomains` or the correct named import.)
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
  const domain = email.slice(at + 1).toLowerCase();
  return DISPOSABLE_SET.has(domain);
}
