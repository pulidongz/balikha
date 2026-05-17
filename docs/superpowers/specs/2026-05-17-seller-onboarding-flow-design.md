# Seller Onboarding Flow — Design

**Date:** 2026-05-17
**Status:** Approved for planning

## Problem

Balikha is a unified-account marketplace: one `user` row per person, everyone is
a buyer by default, and a seller is a buyer who has opened a shop (one optional
1:1 row in `artisan_profiles`). The account model is sound and stays unchanged.

The **transitions between surfaces** are broken:

1. **Signup ignores intent.** `components/auth/sign-up-form.tsx:23` hardcodes
   `next = '/account'` for everyone. A user who came to sell lands on a buyer's
   account page. The existing code comment concedes this is a compromise.
2. **Selling is undiscoverable for anonymous visitors.** The only entry points
   are the signed-in user menu and stumbling onto `/dashboard`.
3. **No seller onboarding.** `becomeArtisanAction` does create a default "Shop"
   catalog, but then drops the new seller on a dashboard of empty stat cards
   with no pull toward listing a first piece.

## Decisions (locked)

1. **Unified account.** No schema change, no migration.
2. **Intent via entry point.** A "Sell your craft" path carries intent into
   signup as `/sign-up?intent=seller`. Default signup remains buyer.
3. **Land on the first-product form.** After a seller names their shop, route
   them straight into the "list your first piece" form, with a calm
   "skip for now" escape — not a multi-step wizard.
4. **Re-entry: resumable checkpoints, no persisted intent.** Intent is
   session-scoped; `/dashboard/become-seller` is the resumable checkpoint. A
   calm "Open a shop" line is added to the buyer first-time welcome to close
   the one re-entry path the affordances miss.

## Goals

- A seller-intent user is routed signup → name shop → first-product form
  without ever touching the buyer-framed `/account` page.
- Anonymous visitors have a discoverable, on-brand path to selling.
- Re-entry after closing the browser never loses work destructively; worst
  case is re-navigating one click.

## Non-goals

- No change to the account model, schema, migrations, `proxy.ts`, or Better
  Auth config.
- No dedicated `/sell` marketing pitch page (future enhancement).
- No durable persistence of onboarding intent (cookie or column).
- No buyer-side onboarding changes beyond the single welcome line.

## The flows

**Buyer (unchanged):**

```
/sign-up  →  submit  →  /account
```

**Seller (new):**

```
/sign-up?intent=seller
  → submit (account created, auto-signed-in)
  → /dashboard/become-seller                       name the shop
  → becomeArtisanAction creates artisan_profile + "Shop" catalog
  → /dashboard/catalogs/<catalog>/products/new?onboarding=1   list first piece
```

The `?onboarding=1` marker tells the product-new page to render a calm
first-listing intro with a "Skip for now → your dashboard" link. The marker is
not re-added by the flow — normal navigation never reproduces it — so the intro
does not recur in ordinary use. A bookmarked or back-button URL that still
carries `?onboarding=1` can re-show it; that is an accepted, harmless edge.

## Detailed changes — file by file

### 1. `components/auth/sign-up-form.tsx`

Read the `intent` search param and use it to pick the post-signup
destination. An explicit, safe `next` (e.g. a proxy-bounce deep link) still
wins, because that is a page the user actually tried to reach.

```ts
const intent = searchParams.get('intent');
const fallback = intent === 'seller' ? '/dashboard/become-seller' : '/account';
const next = safeNextOr(searchParams.get('next'), fallback);
```

Only the literal `'seller'` is meaningful; an absent or unrecognized `intent`
legitimately means "buyer" — this is explicit case modeling, not a masked
default.

### 2. `lib/actions/artisan.ts` — `becomeArtisanAction`

Return type changes from `Result<{ shopSlug: string }>` to
`Result<{ shopSlug: string; firstCatalogSlug: string | null }>`.

- **Create branch:** add `.returning({ slug: catalogs.slug })` to the catalog
  insert and return that slug as `firstCatalogSlug`.
- **Existing-profile early-return branch:** also select the profile `id`, then
  query the seller's oldest catalog
  (`order by createdAt asc limit 1`). `firstCatalogSlug` is its slug, or
  `null` when the seller has no catalogs (a real state — catalogs can be
  deleted; `null` explicitly represents it).

The `withIdempotency` cache serializes the whole `Result` for 24h. New calls
after this change carry `firstCatalogSlug` through retries. A retry of a
pre-change cached call (same idempotency key, within the 24h TTL) replays the
old `{ shopSlug }` shape with `firstCatalogSlug` absent — see Edge cases for
how the form handles a missing slug.

### 3. `components/dashboard/become-seller-form.tsx`

On success, replace `router.refresh()` with an explicit push:

```ts
const { firstCatalogSlug } = result.data;
router.push(
  firstCatalogSlug
    ? `/dashboard/catalogs/${firstCatalogSlug}/products/new?onboarding=1`
    : '/dashboard',
);
```

Navigating to a server-component route triggers a fresh server render, so no
separate `refresh()` is needed. Any falsy `firstCatalogSlug` — `null` (a
returning seller with no catalogs) or `undefined` (a stale pre-change
idempotency-cache replay) — routes to `/dashboard`, which always exists and
self-orients the seller with its empty-state CTAs.

### 4. `app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/new/page.tsx`

Accept `searchParams` and, when `onboarding === '1'`, swap the header.

- **Normal header (unchanged):** `← {catalog.title}` breadcrumb + "New product".
- **Onboarding header:** a calm intro using `profile.shopName`, e.g.
  - heading: "{shopName} is live"
  - line: "Add your first piece below — you can do this anytime from your
    dashboard."
  - link: "Skip for now → your dashboard" pointing at `/dashboard`.

The `ProductForm` component itself is unchanged. This is a contained
conditional in the page's header block.

### 5. `components/layout/site-footer.tsx`

Convert to an async server component that reads the session, and add a
"Sell your craft" link to the footer nav. The link is auth-aware:

```ts
const sellHref = session ? '/dashboard/become-seller' : '/sign-up?intent=seller';
```

`/dashboard/become-seller` already self-redirects to `/dashboard` for users who
have a shop (`become-seller/page.tsx:16`), so the signed-in branch is correct
whether or not the user is already a seller.

### 6. `components/account/first-time-buyer-welcome.tsx`

Add a single calm line below the "Get started" card pointing makers to open a
shop, e.g. "Make work of your own? **Open a shop on Balikha**." The link points
to `/dashboard/become-seller` (the viewer is always signed in here). Note this
welcome renders only when the buyer has zero activity, so the line reaches
first-time buyers (and makers who are also buyers) — it is a bonus prompt, not
the primary State-2 re-entry net (see Re-entry below).

### 7. `lib/auth-helpers.ts` — minor (recommended)

Both `SiteHeader` and the now-async `SiteFooter` call `getCurrentSession()` on
every marketing page render. Wrap `getCurrentSession` in React `cache()` so the
two share a single per-request lookup instead of two.

## Re-entry behavior

`autoSignIn: true` (`lib/auth.ts:9`) plus Better Auth's default 7-day session
means a user who closes the browser and returns within the realistic window is
**still signed in**. Three drop-off points:

1. **Closed mid-signup (no account).** Nothing persisted. They sign up again.
   If they return via a plain bookmark the `intent` param is lost; recoverable
   in one click via the footer/menu "Sell" link.
2. **Account created, shop not yet named.** They return signed in. The system
   has no memory of seller intent (a State-2 account is identical to a buyer
   with no shop), but re-entry still works: `/dashboard` redirects to
   `become-seller`; the header user menu and footer both show "Sell"; the
   shop-name form is idempotent. Those always-present "Sell" affordances are
   the safety net. If such a user lands on `/account` with zero buyer
   activity, the first-time welcome line (change #6) also prompts them; with
   any activity they see the normal `/account` and rely on the header/footer
   links. The only un-resumed path is a 7+ day idle session expiry → sign
   back in → `/account` → self-navigate.
3. **Shop created, no products.** Fully self-healing — `/dashboard` shows the
   empty-state "Add a product" CTA and the menu shows "My shop". The
   `?onboarding=1` intro is correctly not replayed.

## Edge cases

- Explicit safe `next` beats `intent` — a deep link the user actually wanted
  wins over inferred intent.
- `firstCatalogSlug === null` is a defensive guard, not a routine flow: it
  arises only if a profile is created concurrently between become-seller page
  load and form submit (near-unreachable, since `become-seller` self-redirects
  existing-profile users). The become-seller form routes it to `/dashboard`.
- A pre-change idempotency-cache entry replayed within its 24h TTL lacks
  `firstCatalogSlug` (reads as `undefined`) → treated as a missing slug → the
  form routes to `/dashboard`. Narrow window, non-destructive.
- Re-submitting `becomeArtisanAction` with an existing profile → idempotent
  early-return, now also yields a catalog slug, so routing still works.
- A signed-in user hitting `/sign-up?intent=seller` directly is not a path the
  UI produces (the footer sends signed-in users to `/dashboard/become-seller`);
  not designed for.

## Testing

- `npm run check` (typecheck + lint + format) must pass clean.
- A `becomeArtisanAction` test asserting `firstCatalogSlug` is returned for
  both the create branch and the existing-profile branch, if the action has
  test coverage in the current suite.
- Manual walk-through:
  - Buyer: `/sign-up` → `/account`.
  - Seller: `/sign-up?intent=seller` → `become-seller` → name shop →
    first-product form with onboarding intro.
  - Footer "Sell your craft" link: anonymous → intent-tagged signup;
    signed-in non-seller → `become-seller`; signed-in seller → `/dashboard`.
  - Re-entry states 1–3 above.
