/**
 * Deterministic guard on the email-domain typo suggester.
 * Self-contained: no DB / network / secrets. Run: npm run test:suggest-domain
 */
import { suggestEmailDomain } from '../lib/email/suggest-domain';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) process.stdout.write(`  ✓ ${msg}\n`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

assert(suggestEmailDomain('ana@gmial.com') === 'ana@gmail.com', 'gmial → gmail');
assert(suggestEmailDomain('ana@hotnail.com') === 'ana@hotmail.com', 'hotnail → hotmail');
assert(suggestEmailDomain('ana@yaho.com') === 'ana@yahoo.com', 'yaho → yahoo');
assert(suggestEmailDomain('ana@gmail.com') === null, 'exact match → no suggestion');
assert(
  suggestEmailDomain('ana@balikha.art') === null,
  'unknown domain (distance>1) → no suggestion',
);
assert(suggestEmailDomain('not-an-email') === null, 'no @ → null');
assert(suggestEmailDomain('ana@') === null, 'empty domain → null');
assert(
  suggestEmailDomain('ANA@GMIAL.COM') === 'ANA@gmail.com',
  'domain compared case-insensitively, local part preserved',
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
process.stdout.write('\nAll suggest-domain checks passed\n');
