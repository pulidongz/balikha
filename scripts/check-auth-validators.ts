/**
 * Deterministic guard on the auth/profile validators.
 * Self-contained: no DB / network / secrets. Run: npm run test:auth-validators
 */
import { signUpSchema } from '../lib/validators/auth';
import { profileUpdateSchema } from '../lib/validators/buyer';

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) process.stdout.write(`  ✓ ${msg}\n`);
  else {
    failures++;
    console.error(`  ✗ ${msg}`);
  }
}

process.stdout.write('signUpSchema\n');
{
  const ok = signUpSchema.safeParse({
    firstName: 'Maria',
    lastName: 'Santos',
    email: 'maria@balikha.art',
    password: 'password123',
    acceptTerms: true,
  });
  assert(ok.success, 'valid input passes');
}
assert(
  !signUpSchema.safeParse({
    firstName: '',
    lastName: 'Santos',
    email: 'maria@balikha.art',
    password: 'password123',
    acceptTerms: true,
  }).success,
  'empty firstName fails',
);
assert(
  !signUpSchema.safeParse({
    firstName: 'Maria',
    lastName: 'Santos',
    email: 'maria@balikha.art',
    password: 'password123',
    acceptTerms: false,
  }).success,
  'acceptTerms false fails',
);
assert(
  !signUpSchema.safeParse({
    firstName: 'Maria',
    lastName: 'Santos',
    email: 'bad-email',
    password: 'password123',
    acceptTerms: true,
  }).success,
  'invalid email fails',
);

process.stdout.write('profileUpdateSchema\n');
{
  const ok = profileUpdateSchema.safeParse({ firstName: 'Maria', lastName: 'Santos' });
  assert(ok.success, 'valid first+last passes');
  const okMono = profileUpdateSchema.safeParse({ firstName: 'Lakan', lastName: '' });
  assert(okMono.success, 'empty lastName allowed (mononym)');
}
assert(
  !profileUpdateSchema.safeParse({ firstName: '', lastName: 'X' }).success,
  'empty firstName fails',
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
process.stdout.write('\nAll auth-validator checks passed\n');
