/**
 * Deterministic guard on the auth/profile validators.
 * Self-contained: no DB / network / secrets. Run: npm run test:auth-validators
 */
import { signUpSchema } from '../lib/validators/auth';
import { profileUpdateSchema } from '../lib/validators/buyer';
import {
  changeEmailSchema,
  changePasswordSchema,
  setPasswordSchema,
} from '../lib/validators/profile-security';

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

process.stdout.write('changeEmailSchema\n');
assert(changeEmailSchema.safeParse({ email: 'new@balikha.art' }).success, 'valid email passes');
assert(!changeEmailSchema.safeParse({ email: 'bad-email' }).success, 'invalid email fails');
// Disposable rejection is intentionally NOT in this schema — it runs in
// changeEmailAction + databaseHooks.user.update.before so the domain JSON stays
// off the client bundle. A disposable address is shape-valid here.
assert(
  changeEmailSchema.safeParse({ email: 'someone@mailinator.com' }).success,
  'disposable email is shape-valid (rejected server-side, not by the schema)',
);

process.stdout.write('changePasswordSchema\n');
assert(
  changePasswordSchema.safeParse({
    currentPassword: 'oldpassword',
    newPassword: 'newpassword1',
    confirm: 'newpassword1',
  }).success,
  'valid change passes',
);
assert(
  !changePasswordSchema.safeParse({
    currentPassword: 'oldpassword',
    newPassword: 'newpassword1',
    confirm: 'different',
  }).success,
  'mismatched confirm fails',
);
assert(
  !changePasswordSchema.safeParse({
    currentPassword: 'oldpassword',
    newPassword: 'short',
    confirm: 'short',
  }).success,
  'too-short new password fails',
);
assert(
  !changePasswordSchema.safeParse({
    currentPassword: '',
    newPassword: 'newpassword1',
    confirm: 'newpassword1',
  }).success,
  'empty current password fails',
);

process.stdout.write('setPasswordSchema\n');
assert(
  setPasswordSchema.safeParse({ newPassword: 'newpassword1', confirm: 'newpassword1' }).success,
  'valid set passes',
);
assert(
  !setPasswordSchema.safeParse({ newPassword: 'newpassword1', confirm: 'nope' }).success,
  'mismatched confirm fails',
);
assert(
  !setPasswordSchema.safeParse({ newPassword: 'x'.repeat(129), confirm: 'x'.repeat(129) }).success,
  'over-128 password fails',
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
process.stdout.write('\nAll auth-validator checks passed\n');
