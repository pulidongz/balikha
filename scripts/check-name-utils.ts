/**
 * Deterministic guard on the name compose/split helpers.
 * Self-contained: no DB / network / secrets. Run: npm run test:name
 */
import { composeName, splitFullName } from '../lib/name';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) process.stdout.write(`  ✓ ${msg}\n`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

process.stdout.write('composeName\n');
assert(composeName('Maria', 'Santos') === 'Maria Santos', 'first + last');
assert(composeName('  Maria ', ' Santos ') === 'Maria Santos', 'trims both parts');
assert(composeName('Lakan', null) === 'Lakan', 'null last → first only');
assert(composeName('Lakan', '') === 'Lakan', 'empty last → first only');

process.stdout.write('splitFullName\n');
assert(splitFullName('Maria Santos').firstName === 'Maria', 'two tokens → first');
assert(splitFullName('Maria Santos').lastName === 'Santos', 'two tokens → last');
assert(
  splitFullName('Maria Clara de los Santos').lastName === 'Clara de los Santos',
  'multi-token surname kept whole',
);
assert(splitFullName('Lakan').firstName === 'Lakan', 'mononym → first');
assert(splitFullName('Lakan').lastName === null, 'mononym → null last');
assert(
  splitFullName('  Maria  Santos  ').firstName === 'Maria',
  'collapses inner/outer whitespace',
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
process.stdout.write('\nAll name-util checks passed\n');
