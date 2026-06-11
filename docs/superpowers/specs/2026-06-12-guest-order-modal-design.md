# Guest Order Modal — Design

**Date:** 2026-06-12
**Status:** Approved pending user review

## Problem

Signed-out visitors who click "Order" on a product page never see the order
dialog. `OrderButton` short-circuits `state: 'signed_out'` to a plain
"Sign in to order" link that routes to `/sign-in`. Balikha's ordering model is
unusual (request-based, no escrow, payment arranged directly with the maker),
and all the content that explains and de-risks it — the four-step explainer,
the maker's track record, the "you are not locked in" reassurance — lives
inside the dialog. Guests are asked to create an account before they are told
why ordering is safe.

The dialog is also visually monotonous: every section is gray
`text-muted-foreground` on white at the same weight, while the brand palette
(Sampaguita & Sea) and the Fraunces serif go unused.

## Decisions

1. **Guests see the dialog.** The "Order" trigger renders for signed-out
   visitors too. The dialog shows the full educational content; the form
   (address picker, notes, consent checkbox) does not render at all — no
   disabled fields.
2. **An auth callout replaces the form.** Sign-up leads (primary "Create an
   account"), sign-in is the secondary link ("Already have one? Sign in").
3. **Post-auth, the user lands back inside the open dialog**, via a
   `?order=1` URL param riding the existing `reorder`/`threadId` auto-open
   mechanism.
4. **Visual direction: "quiet accents"** — the smallest set of changes that
   stops the dialog feeling monotonous (chosen over a cream-canvas
   "warm editorial" and a tinted-panel "color-coded" direction).
5. **Implementation: one dialog with a guest branch** (chosen over a separate
   `GuestOrderDialog` and over educating on the sign-up page). Shared
   sections render for both audiences; form machinery renders only for
   signed-in buyers.

## Flow & routing

- `OrderButton` (`components/marketplace/order-button.tsx`) drops the
  `signed_out` early-return link. `signed_out` renders `OrderDialog` with a
  new `guest: boolean` prop. The trigger button reads "Order" for everyone.
- The existing `signInRedirect` prop (already receives
  `workPath(shopSlug, productSlug)` from the product page) is renamed
  `productPath` and used to build both auth hrefs:
  - `/sign-up?next=<encodeURIComponent(productPath + '?order=1')>`
  - `/sign-in?next=<encodeURIComponent(productPath + '?order=1')>`
- `?order=1` joins the lazy `useState` open-init alongside `reorder` and
  `threadId`, and the same strip effect deletes it after mount, so a refresh
  does not reopen the dialog.
- The round trip works on all auth paths with no auth changes: both forms
  already validate `next` with `safeNextOr`, thread it through email
  verification (`/verify-email?status=verified&next=…`), and pass it to the
  Google OAuth button.
- No product-page query changes: `sellerTrust` is already computed for
  guests, and `addresses` is already `[]` when `viewer === null`.

## Dialog content (guest)

Top to bottom: title/description → "How ordering works" steps → "This maker"
trust block → "You are not locked in" panel → **GuestAuthPanel** → footer
with Cancel only.

`GuestAuthPanel` (new, same file): an oat `bg-secondary` rounded panel —

- Heading: "Sign up to send this request"
- Body line: "It's free — the maker replies to you directly."
- Primary `Button`-styled link: "Create an account" → sign-up href above
- Secondary inline link: "Already have one? Sign in" → sign-in href, with the
  standard `underline-offset-4 hover:underline` treatment

For guests, the address fieldset, notes textarea, consent checkbox, and
"Place order" submit do not render. `placeOrder` is unreachable client-side
for guests, matching the server action's own auth guard.

## Visual refresh ("quiet accents", both guest and signed-in states)

- **Title**: `DialogTitle` gains `font-serif text-xl` (Fraunces), with a
  short vermilion rule beneath: `h-0.5 w-9 rounded-full bg-accent`.
  `--gold` stays reserved for limited drops per the token comment.
- **Step numbers**: filled discs — `bg-primary text-primary-foreground`
  (navy/cream) — replacing the outlined circles; connector stays
  `border-border`.
- **"You are not locked in" panel**: `bg-background border border-border`
  (cream card with border) replacing gray `bg-secondary/50`.
- **GuestAuthPanel**: oat `bg-secondary` as above.
- Everything else (address cards, notes, checkbox, error styling, footer
  buttons) keeps its current treatment.

The result is three warmth levels of one family on the white dialog — white
card, cream panel, oat panel — plus one vermilion accent, with no new hues.

## Edge cases

- **`?order=1` on a product no longer orderable** (sold out meanwhile, or
  own listing): no dialog exists in those states, so the param is never
  consumed and stays in the URL until navigation. Accepted; no handling.
- **`?order=1` while still signed out** (shared/bookmarked URL): dialog
  auto-opens in guest mode. Harmless.
- **Fresh signup with zero addresses**: returns to the open dialog and hits
  the "you need a shipping address" notice. Per the addendum below, that
  notice now round-trips through the add-address page and back.
- **Open redirect**: no new risk; `safeNextOr` already validates `next`.

## Verification

No component-test framework exists (tests are `tsx` check-scripts for pure
logic), so verification is the standard gates plus manual passes:

- prettier, eslint, typecheck — all green.
- Manual: (1) signed-out → dialog shows education + auth panel, no form;
  (2) sign-up round trip lands back in the open dialog; (3) sign-in round
  trip same; (4) signed-in order flow unchanged end-to-end; (5) `?reorder=1`
  and the thread-CTA auto-open still work.

## Out of scope

- Any change to the sign-up/sign-in pages or `placeOrder`.
- Restyling other dialogs or the product page.
- The `--gold` token and limited-drop styling.

## Addendum (2026-06-12): address-add return path

Manual testing found the new-buyer funnel dead-ended: from the reopened
dialog, "Add an address" sent the user to account settings with no way back
to the product. Address management was originally out of scope; this
addendum brings the minimal return path in:

- The dialog's no-addresses notice links to
  `/account/addresses/new?next=<productPath>?order=1` (encoded once) and the
  copy promises the round trip ("…you'll come right back to this order").
- `app/(account)/account/addresses/new/page.tsx` validates `next` with
  `safeNextOr` (fallback `/account/addresses`) and passes it to `AddressForm`
  as `returnTo`.
- `AddressForm` gains an optional `returnTo` prop (default
  `/account/addresses`) used for the post-save redirect and Cancel. The edit
  page passes nothing and behaves as before.
- The signed-out redirect on the new-address page deliberately drops `next`:
  `safeNextOr` rejects `%`, so a nested-encoded value would fail validation.
  Unreachable from the dialog anyway (the notice renders only for signed-in
  users).
