/**
 * Regression guard for the order-lifecycle auth-bypass fix (security audit).
 * `transitionOrder` delegates authorization to an optional callback that cannot
 * cross the server-action boundary, so it MUST NOT live in a `'use server'`
 * module (where it would be a directly-callable endpoint reachable with the
 * check stripped). This asserts:
 *   1. lib/orders/transition.ts has no `'use server'` directive, and
 *   2. no lib/actions/*.ts re-exports transitionOrder (which would re-expose it).
 * Self-contained: no DB / network / secrets. Run: npm run test:transition-guard
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, section, finish } from './lib/check-harness';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

section('transition.ts is not a server-action module');
const transitionSrc = readFileSync(path.join(repoRoot, 'lib/orders/transition.ts'), 'utf8');
// A `'use server'` directive must be the first statement; match it at the top,
// tolerating a leading comment block, as a bare directive line.
const hasUseServerDirective =
  /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*['"]use server['"]\s*;?/.test(transitionSrc);
assert(!hasUseServerDirective, "lib/orders/transition.ts has no 'use server' directive");
assert(
  transitionSrc.includes('export async function transitionOrder'),
  'transition.ts still exports transitionOrder (moved, not deleted)',
);

section('no lib/actions/*.ts re-exports transitionOrder');
const actionsDir = path.join(repoRoot, 'lib/actions');
const offenders: string[] = [];
for (const file of readdirSync(actionsDir)) {
  if (!file.endsWith('.ts')) continue;
  const src = readFileSync(path.join(actionsDir, file), 'utf8');
  // A re-export would look like `export { transitionOrder }` or
  // `export ... from '...transition'` naming it. Importing it for internal use
  // (the current, safe pattern in orders.ts) is fine and not flagged.
  if (/export\s*\{[^}]*\btransitionOrder\b[^}]*\}/.test(src)) offenders.push(file);
}
assert(
  offenders.length === 0,
  `no action file re-exports transitionOrder${offenders.length ? ` (offenders: ${offenders.join(', ')})` : ''}`,
);

finish('All transition server-only guard checks passed');
