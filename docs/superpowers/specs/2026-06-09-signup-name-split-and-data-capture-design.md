# Split name + harden signup/signin data capture — Design

**Date:** 2026-06-09
**Status:** Approved (design), ready for implementation planning
**Stack:** Next.js (custom build), Better Auth 1.6.9, Drizzle (Postgres), Zod

## Problem

Signup captures a single free-text **Name** field. This is fragile:

- Three UI surfaces derive a first name with `name.split(' ')[0]` (dashboard,
  account page, first-time-buyer welcome), which breaks on mononyms and
  multi-token surnames (e.g. "Maria Clara de los Santos").
- Google OAuth discards the structured name Google already provides:
  Better Auth's default Google mapping copies only the combined `name`, ignoring
  the `given_name` / `family_name` claims present in the ID token.

We want structured first/last names captured at signup and from Google, plus a
set of low-risk data-capture improvements to the auth forms.

## Constraints / key facts (verified against installed code)

- **Better Auth owns the core `name` field** (used by sessions, admin, emails).
  We must keep `name`; we add `firstName` / `lastName` alongside and keep `name`
  composed and in sync. We do **not** drop `name`.
- **`user.additionalFields`** is supported by `@better-auth/core`
  (`types/init-options`) — so `firstName`, `lastName`, `acceptedTermsAt` become
  first-class fields Better Auth reads/writes/validates.
- **Built-in Google provider supports `mapProfileToUser`**
  (`@better-auth/core/.../social-providers/google.mjs`): `getUserInfo` runs
  `decodeJwt(idToken)` (full OIDC claims incl. `given_name` / `family_name`),
  calls `mapProfileToUser(profile)`, and spreads the result over the user record.
- **Edge case:** Google may return `given_name` without `family_name` (mononym
  accounts). The Google path must tolerate a missing surname.
- **Existing `databaseHooks.user.create`** already blocks disposable emails — the
  single seam to also stamp `acceptedTermsAt` and compose `name` for both paths.

## Decisions

- **Last name:** required in the email/password form; **nullable in the DB** so
  the Google mononym path doesn't crash.
- **Terms of Service:** required checkbox on signup; `acceptedTermsAt` stamped at
  account creation for **both** email/password and Google signups via the create
  hook. `/terms` and `/privacy` pages already exist to link to. This is a
  deliberate **"acceptance implied at account creation"** record, NOT a
  per-request consent gate — the checkbox is enforced client-side only, and the
  seed/programmatic callers are stamped too. Acceptable at this pre-launch stage;
  revisit if `acceptedTermsAt` is ever needed as legal consent evidence.
- **Marketing opt-in:** out of scope (no marketing yet). No `marketingOptIn`
  column.
- **Password strength meter:** not included (show/hide toggle only).

## Design

### 1. Data model — `db/schema/auth.ts` + migration

Add to the `user` table:

- `firstName text NOT NULL DEFAULT ''`
- `lastName text` (nullable)
- `acceptedTermsAt timestamp` (nullable)

`name` stays as the canonical display value. For the email/password and seed
paths it is composed as `trim(firstName + ' ' + lastName)`. For Google it stays
Google's display-name claim (which may differ from `given + family`). There is
**no enforced `name === composeName(first,last)` invariant** across all paths —
`name` is the display name; `firstName`/`lastName` are the structured fields.

**Backfill** existing rows in the migration: `firstName` = first whitespace
token of `name`, `lastName` = the remainder (nullable if absent). Update the seed
script to write `firstName` / `lastName` directly (and compose `name`).

### 2. Better Auth config — `lib/auth.ts`

- `user.additionalFields`: `firstName`, `lastName`, `acceptedTermsAt`.
- `socialProviders.google.mapProfileToUser(profile)` returns:
  - `firstName: profile.given_name ?? profile.name?.split(' ')[0]`
  - `lastName: profile.family_name ?? null`
- Extend existing `databaseHooks.user.create` (before-create) to:
  - **guard** that `name` is non-empty (raise `APIError` if blank — the only
    server-side floor, since additionalFields are `required:false`),
  - stamp `acceptedTermsAt = new Date()` on creation.
  - It does **not** recompose `name` — `name` is composed at each call site
    (the form composes before `signUp.email`; the seed passes a composed
    `name`; Google keeps its display-name claim).

### 3. Signup form — `components/auth/sign-up-form.tsx`

- Replace single "Name" with **First name** + **Last name** (both required).
- Autocomplete tokens: `given-name`, `family-name`, `email`, `new-password`.
- **Password show/hide** toggle.
- **Email typo suggestion**: tiny client-side common-domain check
  (`gmial.com → gmail.com`) over a small domain list using edit-distance 1,
  rendered as a dismissible "Did you mean …?" hint. No new dependency.
- **Trim** first/last; compose `name` before
  `signUp.email({ email, password, name, firstName, lastName })`.
- **Terms checkbox (required)** linking to `/terms` and `/privacy`; form cannot
  submit unchecked.

### 4. Signin form — `components/auth/sign-in-form.tsx` + auth pages

- Add `autoComplete="email"` / `current-password` and the **password show/hide**
  toggle. No name fields.
- Inline Terms-acceptance note under the "Continue with Google" button on the
  auth pages, so OAuth users have clear notice (acceptance recorded by the create
  hook).

### 5. Validators — `lib/validators/auth.ts`, `lib/validators/buyer.ts`

- `signUpSchema`: replace `name` with `firstName` (1–40), `lastName` (1–40),
  `acceptTerms` (literal `true`). Compose `name` from the two.
- `profileUpdateSchema`: split into `firstName` + `lastName` (profile edit page
  becomes two fields).

### 6. Consumption cleanup (blast radius)

- Remove the three `name.split(' ')[0]` hacks (dashboard, account page,
  first-time-buyer welcome) → use `firstName` directly.
- Admin user search: match `firstName`, `lastName`, **and** `name`.
- Orders / messaging displays read `name` (kept in sync) → **no change**.

### 7. Error handling

- No fallback masking: invalid input raises Zod errors surfaced to the form.
- Google `mapProfileToUser` returns `null` surname explicitly (not a silenced
  default); the nullable column models the real "no surname provided" state.
- The create hook guards a non-empty `name` (Better Auth requires it); a blank
  `name` (e.g. a scripted POST with empty first/last) raises `APIError`, never a
  silently-substituted default. Display greetings read `firstName` directly with
  **no `|| name` fallback** — an empty `firstName` is a data bug to surface, not
  to mask by reverting to the full name (which would re-introduce the very
  split-name display this work removes).

## Testing

- **Unit:** `signUpSchema` (both-required, terms-required, name composition);
  email-typo suggester (hit, miss, dismiss); Google `mapProfileToUser` with and
  without `family_name`.
- **Integration:** email/password signup persists `firstName`/`lastName`/`name`/
  `acceptedTermsAt`; Google signup splits names and tolerates missing surname;
  profile update round-trips first/last; admin search matches across fields.

## Out of scope

- Marketing opt-in / newsletter.
- Password strength meter.
- Phone capture, buyer/seller intent at signup, real-time email-exists checks.
