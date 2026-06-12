# Auth Pages Revamp — Design

**Date:** 2026-06-12
**Status:** Approved pending user review

## Problem

The auth pages (sign-in, sign-up, reset-password) are functional but flat —
a plain card on a gray wash with none of the brand's editorial presence —
and they have two concrete UX defects:

1. **Broken tab order.** `Show`/`Hide` and `Forgot password?` render in the
   password _label row_, between the email and password inputs in DOM order
   (`components/auth/sign-in-form.tsx:127-144`), so Tab from email hits two
   links before reaching the password field. Sign-up has the same `Show`
   link pattern.
2. **Show/hide as a text link** instead of the conventional in-field eye
   toggle.

The reset-password dead-end states (missing token, expired link) are
serviceable but unfinished: bare outline icon, no brand motif, and the
primary action ("Request a new link") styled as a secondary button.

## Decisions

1. **Editorial split layout** (chosen over polished-centered-card and
   open-letterhead directions, from rendered mockups + user's reference):
   form pane left, full-bleed craft photo right, applied to ALL `(auth)`
   pages via the shared layout.
2. **Photo source: editorial feature with fallbacks** (chosen over a
   committed static photo and over stock imagery — stock undermines the
   "real work from real studios" brand promise). Unsplash/Pexels were
   considered and rejected as off-brand, not as illegitimate.
3. **Shared `PasswordInput` component** with a lucide `Eye`/`EyeOff` toggle
   inside the field, used by sign-in, sign-up, and reset-password.
4. **Tab order fix by DOM order**, not tabindex hacks: toggle after the
   input; `Forgot password?` below the field.

## The shell (`app/(auth)/layout.tsx`)

Becomes an async server component rendering a two-pane split at `lg:`+:

- **Left pane** (`bg-background` cream): wordmark link top-left (as today),
  the page's card vertically centered at `max-w-md`. Every auth page drops
  in structurally unchanged.
- **Right pane**: full-bleed work photo (`next/image`, `object-cover`) with
  a bottom navy gradient; over it the serif brand line ("Handmade, from the
  Philippines.") and a credit line (work title · studio name). No links —
  the image is atmosphere, not navigation.
- **Below `lg`**: photo pane hidden (CSS); the page is today's centered
  single column.

**Media pipeline** — layout calls `getEditorialFeature()`
(`lib/queries/editorial-feature.ts`); explicit fallback chain:

1. Editorial feature image + its credit.
2. No feature → newest published work's primary image + that credit
   (one small query).
3. Empty platform → navy brand panel (`bg-primary`) with the serif brand
   line and no photo. (Amended from "committed brand photo" during
   implementation: no rights-cleared asset exists to commit, the case is
   reachable only on an empty database, and a navy panel can never render
   as a broken image.)

The panel can never render empty; in steady state it is founder-curated
and doubles as artist promotion (extends the T15 mechanism's reach).

## `PasswordInput` (`components/auth/password-input.tsx`, new)

Wrapper around the existing `Input`:

- `type={visible ? 'text' : 'password'}`, `className="pr-10"`; absolutely
  positioned toggle button at the right edge, vertically centered; lucide
  `Eye`/`EyeOff` (16px, `text-muted-foreground hover:text-foreground`).
- DOM order: input first, toggle after → Tab flows email → password →
  toggle → onward. Toggle stays keyboard-focusable (no `tabIndex={-1}`)
  with `aria-label` ("Show password"/"Hide password") and `aria-pressed`.
- Accepts standard input props (`id`, `value`, `onChange`, `autoComplete`,
  `required`) so all three consumers swap in without behavior change.

## Form changes

- **sign-in-form.tsx**: label row loses both extras. `Show/Hide` deleted
  (now in-field); `Forgot password?` moves below the password field,
  right-aligned, small — after the input in DOM. Resulting tab order:
  email → password → eye → forgot → Turnstile → Sign in.
- **sign-up-form.tsx**: same `PasswordInput` swap and label-row cleanup.
  Field order (first name → last name → email → password) already tabs
  naturally; nothing else moves.
- **reset-password form (valid-token state)**: same swap for the new
  password field(s).
- **Card polish (all auth cards)**: serif heading gains the vermilion tick
  beneath it (the established motif from the order dialog and emails);
  spacing tightened. Google button, terms note, OR divider, Turnstile, and
  footer links unchanged.

## Reset-password dead-end states

`ResetLinkError` (missing-token and expired/used states) gets the brand
finish, keeping its existing calm-not-alarming intent:

- lucide `CircleAlert` in an oat (`bg-secondary`) tinted disc, driftwood
  icon color (not destructive red — an expired link isn't an emergency).
- Serif title + vermilion tick, consistent with the other cards.
- **"Request a new link" becomes the primary (navy) button** — it is the
  primary action; "Back to sign in" stays a quiet text link.
- Copy unchanged; both states keep their distinct titles/bodies
  (expired-vs-missing branching on `?error=INVALID_TOKEN` is untouched).

## Verification

`npm run check` green, zero warnings. Manual passes:

1. Tab sequence on sign-in: email → password → eye → forgot → Turnstile →
   submit. Sign-up equivalent.
2. Eye toggle masks/unmasks on sign-in, sign-up, and reset-password.
3. Split shows the editorial feature; with the feature unset, the
   newest-work fallback; on an empty dev DB, the committed photo.
4. `< lg` width: single-column form, no photo.
5. Sign-in and sign-up round trips work end-to-end, including `?next=`
   redirects (regression surface from the guest-order flow).
6. Reset-password dead-end states render the new treatment (visit
   `/reset-password` with no token and with `?error=INVALID_TOKEN`).

## Out of scope

- Auth logic, Turnstile, Google OAuth, copy changes.
- Forgot-password and verify-email page contents (they inherit the shell
  only).
- The T15 admin featuring controls.
