# Split Name + Harden Signup/Signin Data Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture structured First/Last names at signup (and from Google OAuth), record Terms acceptance, and add low-risk field-hygiene improvements to the auth forms — without breaking Better Auth's required `name` field.

**Architecture:** Keep Better Auth's core `name` as the canonical display value and add `firstName` / `lastName` / `acceptedTermsAt` as Better Auth `additionalFields` (real columns). For the email/password and seed paths, `name` is composed as `first + ' ' + last`; for Google, `name` stays Google's display-name claim while `firstName`/`lastName` come from `given_name`/`family_name` (these may legitimately differ — there is no enforced `name === composeName(first,last)` invariant). Google's structured names are mapped via the built-in provider's `mapProfileToUser` seam. Pure logic (name compose/split, Google mapping, email-domain suggestion, validators) is extracted into small testable modules verified by `tsx scripts/check-*.ts` scripts — the repo's existing test convention (there is no vitest).

**Tech Stack:** Next.js (custom build via `bin/build`), Better Auth 1.6.9, Drizzle (Postgres) + drizzle-kit, Zod, React client components, `tsx` check scripts.

**Spec:** `docs/superpowers/specs/2026-06-09-signup-name-split-and-data-capture-design.md`

---

## Conventions for this plan

- **Tests** are standalone scripts under `scripts/check-*.ts`, run with `tsx`, using a local `assert()` that `process.exit(1)`s on failure. Mirror `scripts/check-structured-data.ts`. Each gets a `test:*` entry in `package.json`.
- **Migrations:** never hand-write the whole file. Run `npm run db:generate` to emit the next `drizzle/NNNN_*.sql`, then hand-edit it to add the backfill `UPDATE`. Apply with `npm run db:migrate`.
- **Git:** commit after each task. Branch first (see Task 0).
- **No fallback masking:** the one deliberate adapter (Google missing `family_name`) is explicit and commented; everywhere else, invalid input raises.

---

## File Structure

**Create:**

- `lib/name.ts` — `composeName(first, last)` + `splitFullName(name)` pure helpers (shared by seed backfill, profile action, Google fallback).
- `lib/auth-google.ts` — `mapGoogleProfileToNames(profile)` pure function (testable Google mapping incl. missing-surname behaviour).
- `lib/email/suggest-domain.ts` — `suggestEmailDomain(email)` typo/domain suggester.
- `scripts/check-name-utils.ts`, `scripts/check-suggest-domain.ts`, `scripts/check-auth-validators.ts`, `scripts/check-google-mapping.ts` — check scripts.
- `drizzle/NNNN_*.sql` — generated migration (+ hand-edited backfill).

**Modify:**

- `db/schema/auth.ts` — add `firstName`, `lastName`, `acceptedTermsAt` columns.
- `lib/auth.ts` — `user.additionalFields`, Google `mapProfileToUser`, extend create hook to stamp `acceptedTermsAt`.
- `lib/auth-client.ts` — add `inferAdditionalFields<typeof auth>()` plugin.
- `lib/validators/auth.ts` — `signUpSchema` → firstName/lastName/acceptTerms.
- `lib/validators/buyer.ts` — `profileUpdateSchema` → firstName/lastName.
- `components/auth/sign-up-form.tsx` — two name fields, autocomplete, password toggle, email-typo hint, terms checkbox, compose `name`.
- `components/auth/sign-in-form.tsx` — password show/hide toggle.
- `lib/actions/profile.ts` — write firstName/lastName + recompose name.
- `components/account/profile-form.tsx` + `app/(account)/account/profile/page.tsx` — two name fields.
- `app/(dashboard)/dashboard/page.tsx`, `app/(account)/account/page.tsx`, `components/account/first-time-buyer-welcome.tsx` — use `firstName` directly.
- `app/(admin)/admin/users/page.tsx` — search across firstName/lastName/name.
- `db/seed/index.ts` — pass firstName/lastName when creating users.
- `package.json` — `test:*` scripts.

---

## Task 0: Branch

- [ ] **Step 1: Create the feature branch off main**

Run:

```bash
git checkout main && git checkout -b feature/signup-name-split
```

Expected: `Switched to a new branch 'feature/signup-name-split'`

---

## Task 1: Name utilities (`lib/name.ts`)

Pure helpers shared by the seed backfill, profile action, and Google fallback. `composeName` is the single source of truth for how first/last become the canonical `name`.

**Files:**

- Create: `lib/name.ts`
- Create (test): `scripts/check-name-utils.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing check script**

Create `scripts/check-name-utils.ts`:

```ts
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
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add after `"test:seo"`:

```json
    "test:name": "tsx scripts/check-name-utils.ts",
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:name`
Expected: FAIL — `Cannot find module '../lib/name'`.

- [ ] **Step 4: Implement `lib/name.ts`**

Create `lib/name.ts`:

```ts
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
```

- [ ] **Step 5: Run the check to verify it passes**

Run: `npm run test:name`
Expected: PASS — `All name-util checks passed`.

- [ ] **Step 6: Lint/format/typecheck the new files**

Run: `npm run format && npm run lint && npm run typecheck`
Expected: clean (no errors).

- [ ] **Step 7: Commit**

```bash
git add lib/name.ts scripts/check-name-utils.ts package.json
git commit -m "feat(auth): add name compose/split helpers"
```

---

## Task 2: Email-domain typo suggester (`lib/email/suggest-domain.ts`)

Suggests a correction when the email's domain is one edit away from a common provider (`gmial.com` → `gmail.com`). Pure, no dependency.

**Files:**

- Create: `lib/email/suggest-domain.ts`
- Create (test): `scripts/check-suggest-domain.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing check script**

Create `scripts/check-suggest-domain.ts`:

```ts
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
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add after `"test:name"`:

```json
    "test:suggest-domain": "tsx scripts/check-suggest-domain.ts",
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:suggest-domain`
Expected: FAIL — `Cannot find module '../lib/email/suggest-domain'`.

- [ ] **Step 4: Implement `lib/email/suggest-domain.ts`**

Create `lib/email/suggest-domain.ts`:

```ts
// Suggest a corrected email when the domain is exactly one edit (Levenshtein
// distance 1) away from a common provider. Returns null when the address is
// already valid-looking, the domain is unknown, or the input is malformed —
// never guesses beyond distance 1. The local part is preserved verbatim; only
// the domain is corrected (and compared case-insensitively).

const COMMON_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'proton.me',
] as const;

function levenshtein(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dist = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) dist[i]![0] = i;
  for (let j = 0; j < cols; j++) dist[0]![j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dist[i]![j] = Math.min(
        dist[i - 1]![j]! + 1,
        dist[i]![j - 1]! + 1,
        dist[i - 1]![j - 1]! + cost,
      );
    }
  }
  return dist[rows - 1]![cols - 1]!;
}

export function suggestEmailDomain(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1).toLowerCase();
  if (COMMON_DOMAINS.includes(domain as (typeof COMMON_DOMAINS)[number])) return null;
  for (const candidate of COMMON_DOMAINS) {
    if (levenshtein(domain, candidate) === 1) return `${local}@${candidate}`;
  }
  return null;
}
```

- [ ] **Step 5: Run the check to verify it passes**

Run: `npm run test:suggest-domain`
Expected: PASS — `All suggest-domain checks passed`.

- [ ] **Step 6: Lint/format/typecheck**

Run: `npm run format && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/email/suggest-domain.ts scripts/check-suggest-domain.ts package.json
git commit -m "feat(auth): add email-domain typo suggester"
```

---

## Task 3: Google profile → names mapping (`lib/auth-google.ts`)

Extract the Google mapping into a pure, tested function so the missing-`family_name` (mononym) edge case is verifiable without OAuth.

**Files:**

- Create: `lib/auth-google.ts`
- Create (test): `scripts/check-google-mapping.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing check script**

Create `scripts/check-google-mapping.ts`:

```ts
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
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add after `"test:suggest-domain"`:

```json
    "test:google-mapping": "tsx scripts/check-google-mapping.ts",
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:google-mapping`
Expected: FAIL — `Cannot find module '../lib/auth-google'`.

- [ ] **Step 4: Implement `lib/auth-google.ts`**

Create `lib/auth-google.ts`:

```ts
import { splitFullName } from '@/lib/name';

// Shape of the decoded Google ID token claims we read. Better Auth passes the
// full decoded JWT to mapProfileToUser; these are the OIDC name claims.
export interface GoogleNameProfile {
  given_name?: string;
  family_name?: string;
  name?: string;
}

// Map Google's structured name claims onto our firstName/lastName.
// - given_name/family_name when present (the normal case).
// - Mononym Google accounts omit family_name → lastName is explicitly null
//   (a real "no surname" state, not a masked default).
// - In the rare case given_name is also absent, split the display name.
export function mapGoogleProfileToNames(profile: GoogleNameProfile): {
  firstName: string;
  lastName: string | null;
} {
  if (profile.given_name) {
    return { firstName: profile.given_name, lastName: profile.family_name ?? null };
  }
  return splitFullName(profile.name ?? '');
}
```

- [ ] **Step 5: Run the check to verify it passes**

Run: `npm run test:google-mapping`
Expected: PASS — `All google-mapping checks passed`.

- [ ] **Step 6: Lint/format/typecheck**

Run: `npm run format && npm run lint && npm run typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/auth-google.ts scripts/check-google-mapping.ts package.json
git commit -m "feat(auth): add testable Google name mapping"
```

---

## Task 4: Validators (`lib/validators/auth.ts`, `lib/validators/buyer.ts`)

`signUpSchema` becomes firstName/lastName/acceptTerms; `profileUpdateSchema` becomes firstName/lastName. Last name optional in the schema (DB-nullable), but the **form** requires it (Task 7); acceptTerms must be literally `true`.

**Files:**

- Modify: `lib/validators/auth.ts`
- Modify: `lib/validators/buyer.ts:6-8`
- Create (test): `scripts/check-auth-validators.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing check script**

Create `scripts/check-auth-validators.ts`:

```ts
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
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add after `"test:google-mapping"`:

```json
    "test:auth-validators": "tsx scripts/check-auth-validators.ts",
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npm run test:auth-validators`
Expected: FAIL — `firstName`/`acceptTerms` not recognised (schema still uses `name`).

- [ ] **Step 4: Update `lib/validators/auth.ts`**

Replace the `signUpSchema` definition (lines 5–12) with:

```ts
export const signUpSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(40),
  // Optional at the schema level (DB column is nullable for Google mononyms);
  // the signup form additionally requires it for the email/password path.
  lastName: z.string().max(40).optional().default(''),
  email: z.string().email('Enter a valid email address').max(254),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(200, 'Password too long'),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Terms to continue' }),
  }),
});
```

Keep `signInSchema` and the `SignInInput` export unchanged. The `SignUpInput` type export (line 19) stays as-is (it re-infers automatically).

- [ ] **Step 5: Update `lib/validators/buyer.ts:6-8`**

Replace the `profileUpdateSchema` definition with:

```ts
export const profileUpdateSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(40),
  lastName: z.string().max(40).optional().default(''),
});
```

- [ ] **Step 6: Run the check to verify it passes**

Run: `npm run test:auth-validators`
Expected: PASS — `All auth-validator checks passed`.

- [ ] **Step 7: Typecheck (will surface downstream consumers)**

Run: `npm run typecheck`
Expected: errors in `lib/actions/profile.ts` (uses `parsed.data.name`) and possibly `components/account/profile-form.tsx`. These are fixed in Tasks 9–10. Note them; do not fix yet. If you prefer green-between-tasks, proceed to Task 9 before committing the suite — but committing the validator now is fine since the script passes.

- [ ] **Step 8: Commit**

```bash
git add lib/validators/auth.ts lib/validators/buyer.ts scripts/check-auth-validators.ts package.json
git commit -m "feat(auth): split name validators into first/last + acceptTerms"
```

---

## Task 5: DB schema + migration

Add `firstName`, `lastName`, `acceptedTermsAt` to the `user` table and backfill existing rows from `name`.

**Files:**

- Modify: `db/schema/auth.ts:10-22`
- Create: `drizzle/NNNN_*.sql` (generated, then hand-edited)

- [ ] **Step 1: Add columns to the Drizzle schema**

In `db/schema/auth.ts`, inside `export const user = pgTable('user', { ... })`, add these three lines immediately after the `name` line (line 12):

```ts
    firstName: text('first_name').notNull().default(''),
    lastName: text('last_name'),
    acceptedTermsAt: timestamp('accepted_terms_at'),
```

(`firstName` is NOT NULL DEFAULT '' so the migration can add it to existing rows before backfill; `lastName` and `acceptedTermsAt` are nullable.)

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new file `drizzle/0009_*.sql` containing three `ALTER TABLE "user" ADD COLUMN ...` statements. Note the exact filename.

- [ ] **Step 3: Hand-edit the migration to backfill existing rows**

Open the generated `drizzle/0009_*.sql`. After the three `ADD COLUMN` statements, append a backfill block:

```sql
--> statement-breakpoint
-- Backfill structured names from the legacy single `name` column.
-- first_name = first whitespace token; last_name = the remainder (NULL if none).
UPDATE "user"
SET
  "first_name" = split_part(trim("name"), ' ', 1),
  "last_name" = NULLIF(
    trim(substring(trim("name") FROM position(' ' IN trim("name")) + 1)),
    ''
  )
WHERE "name" IS NOT NULL AND trim("name") <> '';
```

(`substring(... FROM position(' ' ...) + 1)` returns the whole string when there is no space, so `NULLIF(trim(...), '')` correctly yields NULL only for true mononyms. This mirrors `splitFullName`'s "first token vs whole remainder" rule.)

- [ ] **Step 4: Apply the migration**

Run: `npm run db:migrate`
Expected: applies `0009_*` with no error.

> NOTE: per project memory, local Postgres can hit "too many clients" if a dev server is running. If `db:migrate` fails with that error, stop the dev server and retry.

> BACKFILL SCOPE (important): the backfill `UPDATE` runs ONLY via this file-based `db:migrate` path. `npm run db:reset` (Task 12) uses `drizzle-kit push`, which applies DDL by schema-diff and does NOT replay migration files — so a reset never runs the backfill, and Task 12's checks do not exercise it (every reset row is created by the seed, which writes first/last directly). Pre-launch there are no production rows, so the backfill is defensive-only. Step 5b below exercises it directly so its correctness isn't left entirely unverified.

- [ ] **Step 5: Verify columns + backfill in the DB**

Run:

```bash
tsx --env-file=.env.development -e "import {db} from './db'; import {user} from './db/schema'; const rows = await db.select({name:user.name, firstName:user.firstName, lastName:user.lastName}).from(user).limit(5); console.log(rows); process.exit(0);"
```

Expected: rows print with `firstName` populated and `lastName` populated for multi-token names (e.g. `{ name: 'Maria Santos', firstName: 'Maria', lastName: 'Santos' }`).

- [ ] **Step 5b: Exercise the backfill SQL against synthetic legacy rows**

Real rows don't predate the columns, so the only way to verify the backfill expression (not just the seed) is to insert blank-`first_name` rows and run the exact `UPDATE` from the migration against them. This guards the one piece of production-only, irreversible logic in this plan.

Run:

```bash
tsx --env-file=.env.development -e "
import {db} from './db'; import {user} from './db/schema'; import {sql, inArray} from 'drizzle-orm';
const ids = ['backfill-test-multi','backfill-test-mono'];
await db.delete(user).where(inArray(user.id, ids));
await db.insert(user).values([
  { id: ids[0], email: ids[0]+'@example.test', name: 'Maria Clara de los Santos', firstName: '', lastName: null },
  { id: ids[1], email: ids[1]+'@example.test', name: 'Lakan', firstName: '', lastName: null },
]);
await db.execute(sql\`UPDATE \"user\" SET \"first_name\" = split_part(trim(\"name\"), ' ', 1), \"last_name\" = NULLIF(trim(substring(trim(\"name\") FROM position(' ' IN trim(\"name\")) + 1)), '') WHERE id IN ('backfill-test-multi','backfill-test-mono')\`);
const rows = await db.select({id:user.id, firstName:user.firstName, lastName:user.lastName}).from(user).where(inArray(user.id, ids));
console.log(rows);
await db.delete(user).where(inArray(user.id, ids));
process.exit(0);"
```

Expected (order may vary):

```
[
  { id: 'backfill-test-multi', firstName: 'Maria', lastName: 'Clara de los Santos' },
  { id: 'backfill-test-mono',  firstName: 'Lakan', lastName: null }
]
```

If the multi-token surname is truncated or the mononym's `lastName` is `''` instead of `null`, the migration's `substring`/`NULLIF` expression is wrong — fix it before proceeding. (The temp rows are deleted by the script.)

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: same pre-existing Task-4 downstream errors only; no new schema errors.

- [ ] **Step 7: Commit**

```bash
git add db/schema/auth.ts drizzle/
git commit -m "feat(db): add first_name/last_name/accepted_terms_at to user with backfill"
```

---

## Task 6: Better Auth config (`lib/auth.ts`)

Register the new fields, map Google's structured names, and stamp `acceptedTermsAt` at creation.

**Files:**

- Modify: `lib/auth.ts`

- [ ] **Step 1: Import the Google mapper**

At the top of `lib/auth.ts`, add to the imports (after line 13):

```ts
import { mapGoogleProfileToNames } from '@/lib/auth-google';
```

- [ ] **Step 2: Map Google's structured names**

In the `socialProviders` block (lines 23–31), add `mapProfileToUser` to the `google` provider:

```ts
const socialProviders =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          // Better Auth's built-in Google provider passes the decoded ID token
          // (full OIDC claims) here and spreads the result over the user record.
          // We populate the structured first/last fields; `name` stays Google's
          // display name (NOT recomposed from first+last — Google's display name
          // is the better display value). given_name/family_name →
          // firstName/lastName, null surname for mononym accounts.
          // `profile` is inferred as Better Auth's GoogleProfile (required
          // given_name/family_name), assignable to the wider GoogleNameProfile
          // that mapGoogleProfileToNames accepts — no inline annotation needed.
          mapProfileToUser: (profile) => mapGoogleProfileToNames(profile),
        },
      }
    : undefined;
```

- [ ] **Step 3: Register the additional fields**

Add a `user` block to the `betterAuth({ ... })` options, immediately before the `emailAndPassword:` key (line 71):

```ts
  user: {
    additionalFields: {
      // input:true → accepted from the email/password sign-up call and from
      // Google's mapProfileToUser. required:false so programmatic paths (seed)
      // and OAuth aren't rejected; the form enforces both for the UI path.
      firstName: { type: 'string', required: false, input: true },
      lastName: { type: 'string', required: false, input: true },
      // input:false → server-controlled only; stamped by the create hook below.
      acceptedTermsAt: { type: 'date', required: false, input: false },
    },
  },
```

- [ ] **Step 4: Guard a non-empty `name` and stamp `acceptedTermsAt` in the create hook**

In `databaseHooks.user.create.before` (lines 158–169), add a server-side guard that `name` is non-empty (design §7: raise, don't substitute — this is the only server-side floor against a scripted blank-name POST, since additionalFields are `required:false`), then stamp acceptance time. Replace `return { data: user };` with:

```ts
// Server-side floor: Better Auth requires a non-empty `name`, and a
// scripted POST could send blank first/last. Raise (as APIError, which
// Better Auth re-throws) rather than persist a junk display name.
if (!user.name?.trim()) {
  throw new APIError('BAD_REQUEST', {
    message: 'A name is required.',
    code: 'NAME_REQUIRED',
  });
}
// `acceptedTermsAt` is stamped at creation for ALL paths. This is a
// DELIBERATE "acceptance is implied at account creation" record — NOT
// a per-request consent gate. The email/password form requires the
// Terms checkbox and Google shows an inline notice, but the seed and
// any programmatic caller are stamped too. We do NOT recompose `name`
// here: for Google, `name` stays the display-name claim while
// firstName/lastName come from given/family (they may legitimately
// differ).
return { data: { ...user, acceptedTermsAt: new Date() } };
```

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: no new errors from `lib/auth.ts`. (Downstream Task-4 errors may remain until Tasks 9–10.)

- [ ] **Step 6: Verify Google mapping + terms stamp end-to-end via seed**

The seed uses `auth.api.signUpEmail` and exercises the create hook. After Task 11 updates the seed, a full `npm run db:reset` confirms `acceptedTermsAt` is populated. For now just confirm typecheck/lint are clean:

Run: `npm run lint`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add lib/auth.ts
git commit -m "feat(auth): register first/last fields, map Google names, stamp terms acceptance"
```

---

## Task 7: Client type inference (`lib/auth-client.ts`)

So `signUp.email({ ..., firstName, lastName })` is typed and `session.user.firstName` is available client-side.

**Files:**

- Modify: `lib/auth-client.ts`

- [ ] **Step 1: Add the inferAdditionalFields plugin**

In `lib/auth-client.ts`, update the imports and the `createAuthClient` plugins array:

```ts
import { createAuthClient } from 'better-auth/react';
import { adminClient, inferAdditionalFields } from 'better-auth/client/plugins';
import type { auth } from '@/lib/auth';

export const authClient = createAuthClient({
  // adminClient mirrors the server admin() plugin; inferAdditionalFields makes
  // firstName/lastName/acceptedTermsAt visible on the typed client + session.
  plugins: [adminClient(), inferAdditionalFields<typeof auth>()],
});
```

Leave the existing `export const { signIn, signUp, ... } = authClient;` block unchanged.

> The `import type { auth }` is a type-only import — it does not pull server code into the client bundle.

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: no new errors from `lib/auth-client.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/auth-client.ts
git commit -m "feat(auth): infer additional user fields on the client"
```

---

## Task 8: Sign-up form (`components/auth/sign-up-form.tsx`)

Two name fields, correct autocomplete, password show/hide, email-typo hint, required Terms checkbox. Compose `name` from first+last before calling `signUp.email`.

**Files:**

- Modify: `components/auth/sign-up-form.tsx`

- [ ] **Step 1: Update imports + state**

Add imports near the top (after line 13):

```ts
import Link from 'next/link';
import { composeName } from '@/lib/name';
import { suggestEmailDomain } from '@/lib/email/suggest-domain';
```

Replace the `const [name, setName] = useState('');` line (line 32) with:

```ts
const [firstName, setFirstName] = useState('');
const [lastName, setLastName] = useState('');
const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null);
const [showPassword, setShowPassword] = useState(false);
const [acceptTerms, setAcceptTerms] = useState(false);
```

- [ ] **Step 2: Compose name + pass structured fields in `attemptSignUp`**

In `attemptSignUp` (around line 63), replace the `signUp.email(...)` call's first argument so it sends the structured fields and a composed `name`:

```ts
const result = await signUp.email(
  {
    email,
    password,
    name: composeName(firstName, lastName),
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    callbackURL,
  },
  { headers: { 'x-captcha-response': turnstileToken ?? '' } },
);
```

- [ ] **Step 3: Wire the email-typo suggestion into the blur handler**

Replace `handleEmailBlur` (lines 82–88) with:

```ts
async function handleEmailBlur() {
  if (!email) return;
  setEmailSuggestion(suggestEmailDomain(email));
  const isDisp = await checkDisposableEmail(email);
  if (isDisp) {
    setError(DISPOSABLE_EMAIL_MESSAGE);
  }
}
```

- [ ] **Step 4: Replace the single Name field with First + Last**

Replace the Name `<div className="space-y-2">…</div>` block (lines 110–121) with:

```tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
  <div className="space-y-2">
    <Label htmlFor="signup-first-name">First name</Label>
    <Input
      id="signup-first-name"
      name="firstName"
      value={firstName}
      onChange={(e) => setFirstName(e.target.value)}
      required
      autoComplete="given-name"
      className="h-11"
    />
  </div>
  <div className="space-y-2">
    <Label htmlFor="signup-last-name">Last name</Label>
    <Input
      id="signup-last-name"
      name="lastName"
      value={lastName}
      onChange={(e) => setLastName(e.target.value)}
      required
      autoComplete="family-name"
      className="h-11"
    />
  </div>
</div>
```

- [ ] **Step 5: Show the email suggestion under the email field**

Immediately after the email field's closing `</div>` (the block ending at line 138), add:

```tsx
{
  emailSuggestion && (
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground -mt-2 text-xs underline-offset-4 hover:underline"
      onClick={() => {
        setEmail(emailSuggestion);
        setEmailSuggestion(null);
      }}
    >
      Did you mean {emailSuggestion}?
    </button>
  );
}
```

- [ ] **Step 6: Add password show/hide toggle**

Replace the password `<div className="space-y-2">…</div>` block (lines 139–152) with:

```tsx
<div className="space-y-2">
  <div className="flex items-center justify-between">
    <Label htmlFor="signup-password">Password</Label>
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground text-xs"
      onClick={() => setShowPassword((s) => !s)}
    >
      {showPassword ? 'Hide' : 'Show'}
    </button>
  </div>
  <Input
    id="signup-password"
    name="password"
    type={showPassword ? 'text' : 'password'}
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    required
    autoComplete="new-password"
    minLength={8}
    className="h-11"
  />
</div>
```

- [ ] **Step 7: Add the required Terms checkbox**

Immediately before the `{(error || captchaError) && (` block (line 153), add:

```tsx
<label htmlFor="signup-terms" className="text-muted-foreground flex items-start gap-2 text-sm">
  <input
    id="signup-terms"
    name="acceptTerms"
    type="checkbox"
    checked={acceptTerms}
    onChange={(e) => setAcceptTerms(e.target.checked)}
    required
    className="mt-0.5 h-4 w-4"
  />
  <span>
    I agree to the{' '}
    <Link href="/terms" target="_blank" className="text-foreground underline underline-offset-4">
      Terms
    </Link>{' '}
    and{' '}
    <Link href="/privacy" target="_blank" className="text-foreground underline underline-offset-4">
      Privacy Policy
    </Link>
    .
  </span>
</label>
```

- [ ] **Step 8: Gate the submit button on Terms acceptance**

In the submit `<Button>` (line 167–172), change the `disabled` prop to:

```tsx
          disabled={loading || !turnstileToken || !acceptTerms}
```

- [ ] **Step 9: Typecheck / lint / format**

Run: `npm run format && npm run lint && npm run typecheck`
Expected: clean for this file.

- [ ] **Step 10: Manual smoke (build + run)**

Run: `npm run build`
Expected: build succeeds. (A full interactive signup is verified in Task 12.)

- [ ] **Step 11: Commit**

```bash
git add components/auth/sign-up-form.tsx
git commit -m "feat(auth): first/last name fields, terms checkbox, password toggle, email-typo hint on sign-up"
```

---

## Task 9: Sign-in form password toggle (`components/auth/sign-in-form.tsx`)

Email/password autocomplete is already correct here — confirmed during planning: `autoComplete="email"` at `sign-in-form.tsx:100` and `autoComplete="current-password"` at `:121` (Design §4 is already satisfied). Add only the show/hide toggle. If a future read shows those attributes missing, add them in this task alongside the toggle.

**Files:**

- Modify: `components/auth/sign-in-form.tsx`

- [ ] **Step 1: Add show-password state**

After `const [loading, setLoading] = useState(false);` (line 34), add:

```ts
const [showPassword, setShowPassword] = useState(false);
```

- [ ] **Step 2: Add the toggle next to the password label**

In the password field block, the label row currently holds the "Forgot password?" link (lines 104–113). Add a Show/Hide button next to the forgot link by replacing the password `<Input ...>` `type="password"` (line 117) with `type={showPassword ? 'text' : 'password'}` and inserting a toggle button. Replace the label row (lines 105–113) with:

```tsx
<div className="flex items-center justify-between">
  <Label htmlFor="signin-password">Password</Label>
  <div className="flex items-center gap-3">
    <button
      type="button"
      className="text-muted-foreground hover:text-foreground text-xs"
      onClick={() => setShowPassword((s) => !s)}
    >
      {showPassword ? 'Hide' : 'Show'}
    </button>
    <Link
      href="/forgot-password"
      className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
    >
      Forgot password?
    </Link>
  </div>
</div>
```

And change the password input's `type="password"` (line 117) to:

```tsx
            type={showPassword ? 'text' : 'password'}
```

- [ ] **Step 3: Typecheck / lint / format**

Run: `npm run format && npm run lint && npm run typecheck`
Expected: clean for this file.

- [ ] **Step 4: Commit**

```bash
git add components/auth/sign-in-form.tsx
git commit -m "feat(auth): add password show/hide toggle on sign-in"
```

---

## Task 10: Profile edit (action + form + page)

Make the profile "Details" form edit First/Last name and recompose `name`.

**Files:**

- Modify: `lib/actions/profile.ts:31-49`
- Modify: `components/account/profile-form.tsx`
- Modify: `app/(account)/account/profile/page.tsx`

- [ ] **Step 1: Update the server action to write first/last + recompose name**

In `lib/actions/profile.ts`, add the import (after line 12):

```ts
import { composeName } from '@/lib/name';
```

Replace the `db.update(...)` block in `updateProfileAction` (lines 41–44) with:

```ts
await db
  .update(user)
  .set({
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName || null,
    name: composeName(parsed.data.firstName, parsed.data.lastName),
    updatedAt: new Date(),
  })
  .where(eq(user.id, current.id));
```

- [ ] **Step 2: Update the profile page to load + pass first/last**

In `app/(account)/account/profile/page.tsx`, change the select (lines 19–24) to also read the new columns and pass them:

```ts
const [row] = await db
  .select({
    firstName: user.firstName,
    lastName: user.lastName,
    name: user.name,
    email: user.email,
    image: user.image,
  })
  .from(user)
  .where(eq(user.id, current.id))
  .limit(1);
const profile = row ?? {
  firstName: current.firstName,
  lastName: current.lastName,
  name: current.name,
  email: current.email,
  image: null,
};
```

And update the `<ProfileForm ... />` usage (line 40):

```tsx
<ProfileForm
  defaults={{
    firstName: profile.firstName,
    lastName: profile.lastName ?? '',
    email: profile.email,
  }}
/>
```

(`AvatarUploader userName={profile.name}` on line 35 stays — `name` is still selected.)

- [ ] **Step 3: Update the profile form to two fields**

In `components/account/profile-form.tsx`, change the `Props` interface (lines 10–15):

```ts
interface Props {
  defaults: {
    firstName: string;
    lastName: string;
    email: string;
  };
}
```

Replace the single Name field block (lines 48–60) with:

```tsx
<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
  <div className="space-y-2">
    <Label htmlFor="profile-first-name">First name</Label>
    <Input
      id="profile-first-name"
      name="firstName"
      defaultValue={defaults.firstName}
      required
      minLength={1}
      maxLength={40}
      autoComplete="given-name"
      aria-invalid={fieldError('firstName') ? true : undefined}
    />
    {fieldError('firstName') && (
      <p className="text-destructive text-xs">{fieldError('firstName')}</p>
    )}
  </div>
  <div className="space-y-2">
    <Label htmlFor="profile-last-name">Last name</Label>
    <Input
      id="profile-last-name"
      name="lastName"
      defaultValue={defaults.lastName}
      maxLength={40}
      autoComplete="family-name"
      aria-invalid={fieldError('lastName') ? true : undefined}
    />
    {fieldError('lastName') && <p className="text-destructive text-xs">{fieldError('lastName')}</p>}
  </div>
</div>
```

- [ ] **Step 4: Run the validator check + typecheck**

Run: `npm run test:auth-validators && npm run typecheck`
Expected: validator check passes; typecheck clean for these three files.

- [ ] **Step 5: Lint / format**

Run: `npm run format && npm run lint`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/profile.ts components/account/profile-form.tsx "app/(account)/account/profile/page.tsx"
git commit -m "feat(account): edit first/last name on profile, recompose display name"
```

---

## Task 11: Consumer cleanup (greetings + admin search)

Delete the three `name.split(' ')[0]` hacks (use `firstName`), and extend admin user search to match first/last.

**Files:**

- Modify: `app/(dashboard)/dashboard/page.tsx:39`
- Modify: `app/(account)/account/page.tsx:17-19,62`
- Modify: `components/account/first-time-buyer-welcome.tsx:7-8` + caller in `app/(account)/account/page.tsx`
- Modify: `app/(admin)/admin/users/page.tsx:43`

- [ ] **Step 1: Dashboard greeting**

In `app/(dashboard)/dashboard/page.tsx`, replace line 39:

```ts
const firstName = session.user.firstName;
```

(No `|| name` fallback: `firstName` is guaranteed non-empty by the form, the Google mapping, the seed, and the create-hook name guard. Falling back to the full name would silently re-introduce the exact split-name display this feature removes — and would violate CLAUDE.md's no-fallback-masking rule.)

- [ ] **Step 2: Account page greeting**

In `app/(account)/account/page.tsx`, delete the `firstName` helper (lines 17–19) and change its use at line 62. The page reads `current` from `getCurrentUser()`; use `current.firstName`:

- Remove lines 17–19 (the `function firstName(fullName: string)` helper).
- Change `<h1 className="font-serif text-3xl">Hi, {firstName(current.name)}</h1>` (line 62) to:

```tsx
<h1 className="font-serif text-3xl">Hi, {current.firstName}</h1>
```

- [ ] **Step 3: First-time-buyer welcome**

In `components/account/first-time-buyer-welcome.tsx`, change the prop from `name` to `firstName`:

- Replace lines 7–8:

```tsx
export function FirstTimeBuyerWelcome({ firstName }: { firstName: string }) {
```

(delete the `const firstName = name.split(' ')[0] ?? name;` line — `firstName` is now the prop.)
Then update the caller in `app/(account)/account/page.tsx` — find `<FirstTimeBuyerWelcome name={current.name} />` and change it to:

```tsx
<FirstTimeBuyerWelcome firstName={current.firstName} />
```

- [ ] **Step 4: Admin user search across first/last/name**

In `app/(admin)/admin/users/page.tsx`, replace the search predicate (line 43):

```ts
      ? or(
          ilike(user.email, `%${search}%`),
          ilike(user.name, `%${search}%`),
          ilike(user.firstName, `%${search}%`),
          ilike(user.lastName, `%${search}%`),
        )
```

- [ ] **Step 5: Typecheck / lint / format**

Run: `npm run format && npm run lint && npm run typecheck`
Expected: clean across all modified files. If `getCurrentUser()`'s type doesn't expose `firstName`, see note below.

> If `current.firstName` is a type error: `getCurrentUser` returns the Better Auth session user. With `additionalFields` registered (Task 6) the server `auth.$Infer` type includes `firstName`/`lastName`. If the helper hard-codes a narrower type, widen it there to include `firstName: string` and `lastName: string | null` from the inferred user type — do not cast with `as`.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/dashboard/page.tsx" "app/(account)/account/page.tsx" components/account/first-time-buyer-welcome.tsx "app/(admin)/admin/users/page.tsx"
git commit -m "refactor(account): use structured firstName, drop split() hacks, broaden admin search"
```

---

## Task 12: Seed structured names + full verification

Update the seed so programmatic signups provide first/last, then reset the DB and verify everything end-to-end.

**Files:**

- Modify: `db/seed/index.ts`

- [ ] **Step 1: Give the seller fixtures structured names**

The `SELLERS` fixtures (lines ~84–165) each have a `name`. Rather than edit all ten, derive first/last in `createUser` from the passed `name` using `splitFullName`, and let buyers use faker's structured names. Add the import (near the existing `slugify` import):

```ts
import { splitFullName } from '@/lib/name';
```

- [ ] **Step 2: Update `createUser` to send first/last**

Replace `createUser` (lines 493–496) with:

```ts
async function createUser(email: string, password: string, name: string) {
  const { firstName, lastName } = splitFullName(name);
  const result = await auth.api.signUpEmail({
    body: { email, password, name, firstName, lastName: lastName ?? '' },
  });
  if (!result.user) throw new Error(`Failed to create user ${email}`);
  return result.user;
}
```

(Seller/admin names like "Maria Santos" split cleanly; the collective "T'boli Collective" → first "T'boli", last "Collective", which is acceptable seed data. Buyers already use `faker.person.fullName()` which is "First Last".)

- [ ] **Step 3: Reset + reseed**

> Stop any running dev server first (local Postgres connection limit, per project memory).

Run: `npm run db:reset`
Expected: completes; seeds admin + 10 buyers + 10 sellers without error.

- [ ] **Step 4: Verify structured names + terms stamp landed**

Run:

```bash
tsx --env-file=.env.development -e "import {db} from './db'; import {user} from './db/schema'; const rows = await db.select({name:user.name, firstName:user.firstName, lastName:user.lastName, acceptedTermsAt:user.acceptedTermsAt}).from(user).limit(5); console.log(rows); process.exit(0);"
```

Expected: every row has non-empty `firstName` and a non-null `acceptedTermsAt`; multi-token names have `lastName` set.

- [ ] **Step 5: Run the full check suite**

Run:

```bash
npm run test:name && npm run test:suggest-domain && npm run test:google-mapping && npm run test:auth-validators
```

Expected: all four print their "All … checks passed" lines.

- [ ] **Step 6: Full quality gate**

Run: `npm run check && npm run build`
Expected: `typecheck`, `lint`, `format:check` all clean; build succeeds.

- [ ] **Step 7: Commit**

```bash
git add db/seed/index.ts
git commit -m "chore(seed): create users with structured first/last names"
```

---

## Task 13: Manual end-to-end verification

Confirm the real flows (not just unit checks) work.

- [ ] **Step 1: Email/password signup**

Start dev (`npm run dev`), open the sign-up page. Verify: First/Last fields render side by side; password Show/Hide toggles; typing `you@gmial.com` then blurring shows "Did you mean you@gmail.com?" and clicking it corrects the field; submit is disabled until the Terms box is checked. Create an account; then query the DB and confirm `first_name`, `last_name`, `name` (= "First Last"), and `accepted_terms_at` are all set.

- [ ] **Step 2: Google signup (if Google creds configured locally)**

If `GOOGLE_CLIENT_ID`/`SECRET` are set in `.env.development`, click "Continue with Google" and complete it. Confirm the created user row has `first_name`/`last_name` from the Google account (not just `name`), and `accepted_terms_at` is set. If creds are not configured locally, note this is covered by `test:google-mapping` + verified in prod smoke.

- [ ] **Step 3: Profile edit**

On `/account/profile`, change First and Last name, save, reload. Confirm both persist and the `/account` greeting ("Hi, …") and dashboard ("Welcome back, …") show the new first name.

- [ ] **Step 4: Admin search**

On `/admin/users`, search by a user's last name only and confirm they appear.

- [ ] **Step 5: Final gate**

Run: `npm run check`
Expected: clean. Implementation complete.

---

## Self-review notes

- **Spec coverage:** name split (T5/T8), Google mapping incl. mononym (T3/T6), autocomplete tokens (T8/T9/T10), input trimming (T1 composeName + T8), password toggle (T8/T9), email-typo suggestion (T2/T8), Terms checkbox + `acceptedTermsAt` (T4/T5/T6/T8), greeting cleanup + admin search (T11), validators (T4), seed (T12). Marketing opt-in intentionally absent. All spec sections map to a task.
- **Type consistency:** `composeName(first, last)` / `splitFullName(name)` / `mapGoogleProfileToNames(profile)` / `suggestEmailDomain(email)` signatures are used identically across producer and consumer tasks. Schema columns `firstName`/`lastName`/`acceptedTermsAt` match the Better Auth `additionalFields` keys and the SQL `first_name`/`last_name`/`accepted_terms_at`.
- **No placeholders:** every code step shows full code; every run step states expected output.
- **CLAUDE.md compliance:** no `as any`/`as unknown`; the one Google `family_name ?? null` is an explicit modelled state, not a masked default; errors surface via Zod/throws rather than being swallowed.
