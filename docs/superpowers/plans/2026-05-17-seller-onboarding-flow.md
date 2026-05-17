# Seller Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route a seller-intent user from signup → name shop → first-product form without ever landing on the buyer account page, and give anonymous visitors a discoverable path to selling.

**Architecture:** Six small, independent edits to existing files. No schema, migration, route, `proxy.ts`, or Better Auth changes. Intent is carried as a `?intent=seller` query param into signup; the post-shop-creation destination is derived from the catalog slug returned by `becomeArtisanAction`. Re-entry is handled by resumable checkpoints (no persisted state).

**Tech Stack:** Next.js 16 (App Router, React 19), Drizzle ORM, Better Auth, TypeScript.

**Testing note:** This project has **no test framework** (`package.json` has no test runner; `npm run check` is typecheck + lint + format only). Per the project's testing strategy this work is UI/routing, not complex business logic, so verification is `npm run check` passing clean plus the manual walk-through given in each task. Do **not** add a test framework — it is out of scope.

**Branch/commit policy:** Commit directly to the current branch (`main`) after each task. Do **not** create a feature branch or open a PR.

**Reference spec:** `docs/superpowers/specs/2026-05-17-seller-onboarding-flow-design.md`

---

### Task 1: `becomeArtisanAction` returns the first catalog slug

The become-seller form (Task 2) needs to know which catalog to send the new
seller into. `becomeArtisanAction` already creates a default "Shop" catalog —
this task surfaces its slug in the return value.

**Note on idempotency:** `withIdempotency` caches the full serialized `Result`
for 24h. In the normal idempotent case — a same-mount re-submit after this
change has shipped — the existing-profile branch finds the just-created
`'shop'` catalog and returns its slug, so routing to the product form still
works. The only failure shape is a retry within 24h of a _pre-this-change_
cached call: it replays the old `{ shopSlug }` shape, so `firstCatalogSlug`
reads as `undefined`. That window is narrow and non-destructive — Task 2 routes
any missing slug to `/dashboard`, so the worst case is the seller lands on
their dashboard instead of the product form.

**Files:**

- Modify: `lib/actions/artisan.ts`

- [ ] **Step 1: Add the `asc` import**

In `lib/actions/artisan.ts`, change the drizzle-orm import (currently line 6):

```ts
import { asc, eq } from 'drizzle-orm';
```

- [ ] **Step 2: Widen the return type**

Change the `becomeArtisanAction` signature (currently lines 29-31):

```ts
export async function becomeArtisanAction(
  formData: FormData,
): Promise<Result<{ shopSlug: string; firstCatalogSlug: string | null }>> {
```

- [ ] **Step 3: Return the catalog slug from the existing-profile branch**

Replace the existing-profile early-return block (currently lines 54-62):

```ts
// If the user already has a profile, treat the request as success
// (covers double-clicks across page reloads where idempotencyKey
// changed but the desired end-state was already achieved).
const [existing] = await db
  .select({ id: artisanProfiles.id, shopSlug: artisanProfiles.shopSlug })
  .from(artisanProfiles)
  .where(eq(artisanProfiles.userId, user.id))
  .limit(1);
if (existing) {
  // A returning seller can have zero catalogs (they delete-able);
  // null explicitly represents that case so the caller can route to
  // catalog management instead of a product form.
  const [firstCatalog] = await db
    .select({ slug: catalogs.slug })
    .from(catalogs)
    .where(eq(catalogs.artisanProfileId, existing.id))
    .orderBy(asc(catalogs.createdAt))
    .limit(1);
  revalidatePath('/dashboard');
  return ok({ shopSlug: existing.shopSlug, firstCatalogSlug: firstCatalog?.slug ?? null });
}
```

- [ ] **Step 4: Capture and return the catalog slug from the create branch**

Replace the transaction + return block (currently lines 74-91):

```ts
const firstCatalogSlug = await db.transaction(async (tx) => {
  const [profile] = await tx
    .insert(artisanProfiles)
    .values({ userId: user.id, shopName, shopSlug })
    .returning();
  if (!profile) throw new Error('Failed to create artisan profile.');

  const [catalog] = await tx
    .insert(catalogs)
    .values({
      artisanProfileId: profile.id,
      slug: 'shop',
      title: 'Shop',
      status: 'draft',
    })
    .returning({ slug: catalogs.slug });
  if (!catalog) throw new Error('Failed to create default catalog.');
  return catalog.slug;
});

log.info({ userId: user.id, shopSlug }, 'Artisan profile created');
revalidatePath('/dashboard');
return ok({ shopSlug, firstCatalogSlug });
```

- [ ] **Step 5: Verify the project still type-checks and lints**

Run: `npm run check`
Expected: completes with no errors (typecheck, lint, format all pass). The
existing `become-seller-form.tsx` never reads `result.data`, so the widened
return type does not break it yet — end-to-end behavior is verified in Task 2.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/artisan.ts
git commit -m "feat(onboarding): return first catalog slug from becomeArtisanAction"
```

---

### Task 2: Route new sellers to the first-product form

After a seller names their shop, push them into the "list your first piece"
form instead of refreshing onto the dashboard.

**Files:**

- Modify: `components/dashboard/become-seller-form.tsx`

- [ ] **Step 1: Replace `router.refresh()` with an explicit push**

In `components/dashboard/become-seller-form.tsx`, replace the success branch
of the `startTransition` callback (currently lines 31-38):

```ts
startTransition(async () => {
  const result = await becomeArtisanAction(formData);
  if (!result.ok) {
    setError(result.error);
    return;
  }
  const { firstCatalogSlug } = result.data;
  // New sellers land on the first-product form; the ?onboarding=1
  // marker tells that page to show a calm first-listing intro. Any
  // falsy slug routes to the dashboard instead: `null` is a defensive
  // guard for a concurrent-profile-creation race (near-unreachable via
  // the UI), and `undefined` is a stale pre-change idempotency-cache
  // replay. The dashboard always exists and self-orients the seller.
  router.push(
    firstCatalogSlug
      ? `/dashboard/catalogs/${firstCatalogSlug}/products/new?onboarding=1`
      : '/dashboard',
  );
});
```

- [ ] **Step 2: Verify the project still type-checks and lints**

Run: `npm run check`
Expected: completes with no errors.

- [ ] **Step 3: Manual verification — the seller naming flow**

Start the dev server (`npm run dev`) if it is not running. In a browser:

1. Sign out if signed in. Go to `https://balikha.localhost:8443/sign-up` and
   create a fresh account.
2. Navigate to `https://balikha.localhost:8443/dashboard/become-seller`.
3. Enter a shop name and submit.
4. Confirm the browser lands on
   `/dashboard/catalogs/shop/products/new?onboarding=1`.

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/become-seller-form.tsx
git commit -m "feat(onboarding): route new sellers to the first-product form"
```

---

### Task 3: First-listing intro on the new-product page

When the new-product page is reached via the onboarding flow (`?onboarding=1`),
show a calm welcome header with a "skip to dashboard" escape instead of the
normal breadcrumb header.

**Files:**

- Modify: `app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/new/page.tsx`

- [ ] **Step 1: Accept `searchParams` and derive the onboarding flag**

Replace the function signature and the first two lines of the body (currently
lines 14-20):

```ts
export default async function NewProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ catalogSlug: string }>;
  searchParams: Promise<{ onboarding?: string }>;
}) {
  const { catalogSlug } = await params;
  const { onboarding } = await searchParams;
  // Ephemeral marker set by the become-seller flow. Not persisted — the intro
  // is a one-time "your shop is live" moment, not a recurring banner.
  const isOnboarding = onboarding === '1';
  const profile = await requireSellerProfile();
```

- [ ] **Step 2: Render the conditional header**

Replace the `<header>` block (currently lines 32-39):

```tsx
{
  isOnboarding ? (
    <header className="space-y-2">
      <h1 className="font-serif text-2xl tracking-tight">{profile.shopName} is live</h1>
      <p className="text-muted-foreground text-sm">
        Add your first piece below — you can do this anytime from your dashboard.{' '}
        <Link href="/dashboard" className="text-foreground hover:underline">
          Skip for now → your dashboard
        </Link>
      </p>
    </header>
  ) : (
    <header>
      <p className="text-muted-foreground text-sm">
        <Link href={`/dashboard/catalogs/${catalog.slug}`} className="hover:underline">
          ← {catalog.title}
        </Link>
      </p>
      <h1 className="mt-2 font-serif text-2xl tracking-tight">New product</h1>
    </header>
  );
}
```

`profile.shopName` is available — `requireSellerProfile()` returns the full
`artisan_profiles` row. `Link` is already imported at the top of the file.

- [ ] **Step 3: Verify the project still type-checks and lints**

Run: `npm run check`
Expected: completes with no errors.

- [ ] **Step 4: Manual verification — both header states**

As a signed-in seller (e.g. seed account `maria@balikha.test` / `password123`):

1. Visit `https://balikha.localhost:8443/dashboard/catalogs/shop/products/new?onboarding=1`
   → header reads "<Shop name> is live" with the "Skip for now" link.
2. Visit the same URL **without** `?onboarding=1`
   → header reads "← Shop / New product" (the normal breadcrumb).

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/dashboard/catalogs/[catalogSlug]/products/new/page.tsx"
git commit -m "feat(onboarding): add first-listing intro to the new-product page"
```

---

### Task 4: Route seller-intent signups into shop creation

Make the signup form read `?intent=seller` and route accordingly.

**Files:**

- Modify: `components/auth/sign-up-form.tsx`

- [ ] **Step 1: Derive the destination from the `intent` param**

In `components/auth/sign-up-form.tsx`, replace the `next` line (currently the
block at lines 21-23, including its comment):

```ts
// Seller-intent signups (from the "Sell your craft" entry point) route into
// the shop-creation flow; everyone else lands on the buyer account page. An
// explicit, safe `next` (e.g. a proxy-bounce deep link) still wins, since
// that is a page the user actually tried to reach.
const intent = searchParams.get('intent');
const next = safeNextOr(
  searchParams.get('next'),
  intent === 'seller' ? '/dashboard/become-seller' : '/account',
);
```

- [ ] **Step 2: Verify the project still type-checks and lints**

Run: `npm run check`
Expected: completes with no errors.

- [ ] **Step 3: Manual verification — both signup intents**

1. Sign out. Go to `https://balikha.localhost:8443/sign-up?intent=seller` and
   create a fresh account → confirm redirect to `/dashboard/become-seller`.
2. Sign out. Go to `https://balikha.localhost:8443/sign-up` (no param) and
   create another fresh account → confirm redirect to `/account`.

- [ ] **Step 4: Commit**

```bash
git add components/auth/sign-up-form.tsx
git commit -m "feat(onboarding): route seller-intent signups into shop creation"
```

---

### Task 5: "Sell your craft" entry point in the footer

Add an auth-aware "Sell your craft" link to the site footer — the only path to
selling that anonymous visitors currently lack. The footer becomes an async
server component that reads the session; `getCurrentSession` is memoized so the
header and footer share one lookup per render.

**Files:**

- Modify: `lib/auth-helpers.ts`
- Modify: `components/layout/site-footer.tsx`

- [ ] **Step 1: Memoize `getCurrentSession` per request**

In `lib/auth-helpers.ts`, add to the imports at the top of the file:

```ts
import { cache } from 'react';
```

Then replace the `getCurrentSession` function (currently lines 37-39):

```ts
// Memoized per request (React cache) so multiple server components in one
// render — SiteHeader and SiteFooter both read it — share a single lookup.
export const getCurrentSession = cache(async () => {
  return auth.api.getSession({ headers: await headers() });
});
```

This is a behavior-preserving change — `getCurrentSession()` is still an
`await`-able function; callers (`getCurrentUser`, `getCurrentUserWithRole`,
and pages) are unaffected.

- [ ] **Step 2: Make `SiteFooter` async and add the link**

Replace the entire contents of `components/layout/site-footer.tsx`:

```tsx
import Link from 'next/link';
import { getCurrentSession } from '@/lib/auth-helpers';

export async function SiteFooter() {
  const session = await getCurrentSession();
  // Anonymous visitors go to intent-tagged signup; signed-in users go straight
  // to the shop-creation page (which self-redirects to /dashboard if they
  // already have a shop).
  const sellHref = session ? '/dashboard/become-seller' : '/sign-up?intent=seller';

  return (
    <footer className="border-t">
      <div className="text-muted-foreground mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 text-sm sm:px-6 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className="text-foreground font-serif text-base">Balikha</p>
          <p>Handmade work from independent artisans.</p>
        </div>
        <nav className="flex gap-6">
          <Link href={sellHref} className="hover:text-foreground">
            Sell your craft
          </Link>
          <Link href="/about" className="hover:text-foreground">
            About
          </Link>
          <Link href="/contact" className="hover:text-foreground">
            Contact
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
        </nav>
      </div>
    </footer>
  );
}
```

`SiteFooter` is rendered only by `app/(marketing)/layout.tsx` and
`app/(account)/layout.tsx`, both server components, so an async footer is safe.

- [ ] **Step 3: Verify the project still type-checks and lints**

Run: `npm run check`
Expected: completes with no errors.

- [ ] **Step 4: Manual verification — link target by auth state**

1. Signed out, on `https://balikha.localhost:8443/` → footer "Sell your craft"
   points to `/sign-up?intent=seller`.
2. Signed in as a buyer with no shop (e.g. `buyer1@balikha.test` /
   `password123`) → the link points to `/dashboard/become-seller`.
3. Signed in as a seller (e.g. `maria@balikha.test`) → the link points to
   `/dashboard/become-seller`, and following it redirects to `/dashboard`.

- [ ] **Step 5: Commit**

```bash
git add lib/auth-helpers.ts components/layout/site-footer.tsx
git commit -m "feat(onboarding): add a Sell-your-craft entry point to the footer"
```

---

### Task 6: Point makers to shop creation from the buyer welcome

Add a calm "Open a shop" line to the buyer first-time welcome. Note this
welcome renders **only for a zero-activity buyer** (empty feed, wishlist,
recently-viewed, and notifications). So the line is a bonus prompt for
first-timers — and for any maker who is also a buyer — not the primary
re-entry safety net. The real net for a returning seller who has not yet
named a shop is the always-present footer "Sell your craft" link (Task 5)
and the existing header user-menu "Sell on Balikha" item.

**Files:**

- Modify: `components/account/first-time-buyer-welcome.tsx`

- [ ] **Step 1: Add the "Open a shop" line below the Get-started card**

In `components/account/first-time-buyer-welcome.tsx`, add this `<p>` as the
last child of the outer `<div className="space-y-8">`, immediately after the
closing `</div>` of the `bg-card` block (currently the `</div>` on line 46):

```tsx
<p className="text-muted-foreground text-sm">
  Make work of your own?{' '}
  <Link
    href="/dashboard/become-seller"
    className="text-foreground font-medium underline-offset-4 hover:underline"
  >
    Open a shop on Balikha
  </Link>
</p>
```

`Link` is already imported at the top of the file. The viewer here is always
signed in, so the link goes straight to `/dashboard/become-seller`.

- [ ] **Step 2: Verify the project still type-checks and lints**

Run: `npm run check`
Expected: completes with no errors.

- [ ] **Step 3: Manual verification — the welcome line**

Sign in as a brand-new buyer account that has zero feed/wishlist/
recently-viewed/notifications activity (create one via plain `/sign-up`). Land
on `/account` → the `FirstTimeBuyerWelcome` shows, and below the "Get started"
card there is a "Make work of your own? Open a shop on Balikha" line linking to
`/dashboard/become-seller`.

- [ ] **Step 4: Commit**

```bash
git add components/account/first-time-buyer-welcome.tsx
git commit -m "feat(onboarding): point makers to shop creation from the buyer welcome"
```

---

## Final verification

- [ ] **Run the full check suite**

Run: `npm run check`
Expected: typecheck, lint, and format:check all pass with no errors.

- [ ] **End-to-end seller walk-through**

1. Signed out, on the home page, click footer "Sell your craft" →
   `/sign-up?intent=seller`.
2. Create an account → redirected to `/dashboard/become-seller`.
3. Name the shop → redirected to the first-product form showing the
   "<Shop> is live" intro.
4. Click "Skip for now → your dashboard" → lands on `/dashboard`.

- [ ] **End-to-end buyer walk-through**

1. Signed out, go to `/sign-up` (no param) → create an account → `/account`.
2. The first-time welcome shows the "Open a shop on Balikha" line.

- [ ] **Re-entry spot-check**

After creating an account but before naming a shop, visit `/dashboard`
directly → confirm it redirects to `/dashboard/become-seller`.

**Note:** the falsy-`firstCatalogSlug` → `/dashboard` fallback branch (Task 2)
is type-checked but not in this manual matrix — triggering it requires an
artificial stale idempotency-cache row or a deleted-all-catalogs seller. This
is accepted: the branch is a two-line ternary covered by `npm run check`.
