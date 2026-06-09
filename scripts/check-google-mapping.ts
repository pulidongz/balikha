/**
 * Deterministic guard on the Google profile → first/last mapping.
 * Self-contained: no DB / network / secrets. Run: npm run test:google-mapping
 */
import { mapGoogleProfileToNames } from '../lib/auth-google';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) process.stdout.write(`  ✓ ${msg}\n`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

{
  const r = mapGoogleProfileToNames({
    given_name: 'Maria',
    family_name: 'Santos',
    name: 'Maria Santos',
  });
  assert(r.firstName === 'Maria', 'given_name → firstName');
  assert(r.lastName === 'Santos', 'family_name → lastName');
}
{
  // Mononym Google account: no family_name. Must not crash; lastName is null.
  const r = mapGoogleProfileToNames({ given_name: 'Lakan', name: 'Lakan' });
  assert(r.firstName === 'Lakan', 'given_name present, no surname');
  assert(r.lastName === null, 'missing family_name → null lastName');
}
{
  // No given_name (rare): fall back to splitting the display name.
  const r = mapGoogleProfileToNames({ name: 'Esperanza Reyes' });
  assert(r.firstName === 'Esperanza', 'fallback firstName from name');
  assert(r.lastName === 'Reyes', 'fallback lastName from name');
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
process.stdout.write('\nAll google-mapping checks passed\n');
