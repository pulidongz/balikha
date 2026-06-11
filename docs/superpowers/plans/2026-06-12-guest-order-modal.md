# Guest Order Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let signed-out visitors open the "Order this piece" dialog (full educational content + a sign-up callout instead of the form), round-trip them back into the open dialog after auth, and apply the approved "quiet accents" visual refresh.

**Architecture:** One dialog with a guest branch. `OrderButton` routes `state: 'signed_out'` into the existing `OrderDialog`; a `guest` flag (derived from `state`) swaps the form area for a new `GuestAuthPanel` and hides the submit button. Post-auth resume rides the existing `?reorder=1`/`?threadId=` URL-param auto-open rail via a new `?order=1` param. Spec: `docs/superpowers/specs/2026-06-12-guest-order-modal-design.md`.

**Tech Stack:** Next.js App Router (read `node_modules/next/dist/docs/` before writing code — this version has breaking changes), React client components, Tailwind v4 tokens from `app/globals.css`, shadcn-style UI primitives in `components/ui/`.

**Verification model:** This repo has NO component-test framework (only `tsx` check-scripts for pure logic). Every task verifies with `npm run check` (tsc + eslint + prettier) and the final task runs a manual browser pass. Work on branch `feature/guest-order-modal` (already created; spec is committed there).

**Files touched (whole plan):**
- Modify: `components/marketplace/order-button.tsx` (all tasks)
- Modify: `app/(marketing)/studio/[artisanSlug]/[productSlug]/page.tsx` (Task 2 only, one prop rename)

---

### Task 1: `?order=1` auto-open + strip

The dialog already auto-opens when the URL has `?reorder=1` or `?threadId=` — initial `open` state is computed once at mount via lazy `useState` init, then an effect strips the params so refresh doesn't reopen. Add `?order=1` to both spots. No visible behavior change yet (nothing links with `?order=1` until Task 2).

**Files:**
- Modify: `components/marketplace/order-button.tsx:158-174`

- [ ] **Step 1: Add `order` to the lazy open-init**

In `OrderDialog`, change the `open` state init:

```tsx
  const [open, setOpen] = useState<boolean>(
    () =>
      searchParams.get('reorder') === '1' ||
      searchParams.get('order') === '1' ||
      searchParams.get('threadId') !== null,
  );
```

Also update the comment above it — it currently names only the reorder and thread flows. Replace the first sentence block with:

```tsx
  // Reorder flow: ReorderButton routes here with ?reorder=1.
  // Thread→order flow: ThreadView's "Order this piece" CTA routes here
  // with ?threadId=<id> (§6.10a). Post-auth flow: GuestAuthPanel's
  // sign-up/sign-in links round-trip back here with ?order=1. All three
  // auto-open the dialog by deriving the INITIAL state from the URL via
  // lazy useState init (computed once at mount). The follow-up effect
  // strips the params so a refresh doesn't reopen — no setState inside
  // an effect.
```

- [ ] **Step 2: Strip `order` in the cleanup effect**

Change the effect body:

```tsx
  useEffect(() => {
    if (
      searchParams.get('reorder') === '1' ||
      searchParams.get('order') === '1' ||
      searchParams.get('threadId') !== null
    ) {
      const next = new URLSearchParams(searchParams.toString());
      next.delete('reorder');
      next.delete('order');
      next.delete('threadId');
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    }
  }, [searchParams, pathname, router]);
```

- [ ] **Step 3: Verify gates**

Run: `npm run check`
Expected: typecheck, eslint, and prettier all pass. If prettier complains, run `npm run format` and re-check. Fix anything else it reports — no "pre-existing issue" exemptions.

- [ ] **Step 4: Commit**

```bash
git add components/marketplace/order-button.tsx
git commit -m "feat(order): auto-open order dialog from ?order=1 param"
```

---

### Task 2: Route guests into the dialog with a GuestAuthPanel

Replace the `signed_out` early-return link with the dialog in guest mode. The `signInRedirect?: string` prop becomes a required `productPath: string` (the product page already passes `workPath(...)` unconditionally). Guests see explainer → trust → "not locked in" → `GuestAuthPanel`; the address fieldset, notes, checkbox, error slot, and submit button do not render.

**Files:**
- Modify: `components/marketplace/order-button.tsx`
- Modify: `app/(marketing)/studio/[artisanSlug]/[productSlug]/page.tsx:343`

- [ ] **Step 1: Change the prop in `OrderButtonProps`**

Replace `signInRedirect?: string;` with:

```tsx
  // Path back to this product (no query string) — used by GuestAuthPanel
  // to build sign-up/sign-in links that round-trip with ?order=1.
  productPath: string;
```

- [ ] **Step 2: Delete the `signed_out` early return in `OrderButton`**

Remove this block entirely (the `signed_out` state now falls through to `<OrderDialog {...props} />`):

```tsx
  if (props.state === 'signed_out') {
    return (
      <Link
        href={`/sign-in${props.signInRedirect ? `?next=${encodeURIComponent(props.signInRedirect)}` : ''}`}
        className={buttonVariants({ size: 'lg', className: 'flex-1 md:flex-none' })}
      >
        Sign in to order
      </Link>
    );
  }
```

Keep the `Link` and `buttonVariants` imports — both are still used (no-addresses notice, `DisabledStateButton`, and the new panel below).

- [ ] **Step 3: Add `GuestAuthPanel`**

Add after `SellerTrustBlock` (before `OrderDialog`):

```tsx
// Shown to signed-out visitors in place of the order form. Sign-up leads:
// a guest browsing without an account most likely doesn't have one yet.
// Both links carry ?next= back to this product with ?order=1 appended so
// the dialog reopens after auth — the same rail ?reorder=1 rides. `next`
// survives email verification and Google OAuth (see sign-up-form.tsx).
function GuestAuthPanel({ productPath }: { productPath: string }) {
  const next = encodeURIComponent(`${productPath}?order=1`);
  return (
    <section className="bg-secondary space-y-1 rounded-md p-4">
      <p className="text-sm font-medium">Sign up to send this request</p>
      <p className="text-muted-foreground text-sm">
        It&rsquo;s free &mdash; the maker replies to you directly.
      </p>
      <Link href={`/sign-up?next=${next}`} className={buttonVariants({ className: 'mt-2 w-full' })}>
        Create an account
      </Link>
      <p className="text-muted-foreground pt-1 text-center text-sm">
        Already have one?{' '}
        <Link
          href={`/sign-in?next=${next}`}
          className="text-foreground underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </section>
  );
}
```

- [ ] **Step 4: Branch the dialog body and footer on `guest`**

At the top of `OrderDialog`, after the hook declarations (the hooks all stay unconditional — React requires it; the form state is simply unused for guests):

```tsx
  const guest = props.state === 'signed_out';
```

In the JSX body, wrap the form-only content. The explainer, trust block, and "not locked in" panel stay shared; everything from the address logic through the error slot becomes the signed-in branch:

```tsx
            {guest ? (
              <GuestAuthPanel productPath={props.productPath} />
            ) : (
              <>
                {noAddresses ? (
                  /* ...existing no-addresses notice, unchanged... */
                ) : (
                  /* ...existing address fieldset, unchanged... */
                )}

                {/* ...existing notes field, unchanged... */}

                {/* ...existing consent checkbox, unchanged... */}

                {/* ...existing error slot, unchanged... */}
              </>
            )}
```

(The placeholders above mean "move the existing JSX inside the fragment unchanged" — do not retype it, just re-indent.)

In the footer, render the submit only for signed-in:

```tsx
          <DialogFooter className="shrink-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            {!guest && (
              <Button type="submit" disabled={!canSubmit}>
                {pending ? 'Placing…' : 'Place order'}
              </Button>
            )}
          </DialogFooter>
```

The `<form>` wrapper stays for both branches; with no submit button rendered and `canSubmit` false (no address, unchecked consent), `placeOrder` is unreachable for guests — matching the server action's own auth guard.

- [ ] **Step 5: Update the product page prop**

In `app/(marketing)/studio/[artisanSlug]/[productSlug]/page.tsx:343`, change:

```tsx
                  signInRedirect={workPath(artisan.shopSlug, product.slug)}
```

to:

```tsx
                  productPath={workPath(artisan.shopSlug, product.slug)}
```

- [ ] **Step 6: Verify gates**

Run: `npm run check`
Expected: all green. tsc will catch any leftover `signInRedirect` references — there must be none.

- [ ] **Step 7: Manual smoke check (guest state)**

Run: `npm run dev` (stop it afterwards — running dev servers saturate local Postgres connections for other scripts).
In a private/incognito window (signed out), open a published product page and click **Order**.
Expected: dialog opens with explainer, maker trust, "not locked in" panel, and the oat sign-up panel; no address/notes/checkbox; footer shows only Cancel. The "Create an account" link href must be `/sign-up?next=%2Fstudio%2F<shop>%2F<work>%3Forder%3D1` (check via right-click → Copy Link).

- [ ] **Step 8: Commit**

```bash
git add components/marketplace/order-button.tsx "app/(marketing)/studio/[artisanSlug]/[productSlug]/page.tsx"
git commit -m "feat(order): open order dialog for guests with sign-up callout"
```

---

### Task 3: Quiet-accents visual refresh

Three styling changes inside `order-button.tsx`, applying to both guest and signed-in states. No structural changes.

**Files:**
- Modify: `components/marketplace/order-button.tsx`

- [ ] **Step 1: Serif title + vermilion accent rule**

In `OrderDialog`'s header, change:

```tsx
          <DialogHeader className="shrink-0">
            <DialogTitle>Order this piece</DialogTitle>
```

to:

```tsx
          <DialogHeader className="shrink-0">
            <DialogTitle className="font-serif text-xl">Order this piece</DialogTitle>
            <div aria-hidden="true" className="bg-accent h-0.5 w-9 rounded-full" />
```

(`--accent` is the Philippine vermilion — documented in `app/globals.css` for "prices, badges, links". Do NOT use `--gold`; the token comment reserves it for limited drops.)

- [ ] **Step 2: Filled step numbers**

In `OrderSteps`, change the number disc from outlined to filled. Replace:

```tsx
                <span className="border-border text-foreground flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium tabular-nums">
```

with:

```tsx
                <span className="bg-primary text-primary-foreground flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums">
```

(The connector line `border-border w-0 flex-1 border-l` stays as is.)

- [ ] **Step 3: "Not locked in" panel — cream card instead of gray**

In `OrderDialog`'s body, change:

```tsx
            <div className="bg-secondary/50 rounded-md p-3 text-sm">
```

to:

```tsx
            <div className="bg-background border-border rounded-md border p-3 text-sm">
```

- [ ] **Step 4: Verify gates**

Run: `npm run check`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add components/marketplace/order-button.tsx
git commit -m "feat(order): quiet-accents visual refresh for order dialog"
```

---

### Task 4: Full manual verification pass

The five passes from the spec. Needs a signed-in test account and a signed-out window; `npm run dev` for the duration, stopped afterwards (local Postgres connection budget).

**Files:** none (verification only)

- [ ] **Pass 1 — Guest dialog:** Signed out, open a product, click Order. Education sections + oat sign-up panel render; no form fields; footer is Cancel only; title is serif with the vermilion rule; step numbers are filled navy discs.

- [ ] **Pass 2 — Sign-up round trip:** From the guest dialog click "Create an account", complete sign-up (and email verification if prompted). Expected: you land back on the product page with the dialog **open**, now in signed-in mode (likely showing the "you need a shipping address… Add an address first" notice for a fresh account). The `?order=1` param disappears from the URL after load; a refresh does NOT reopen the dialog.

- [ ] **Pass 3 — Sign-in round trip:** Signed out, guest dialog → "Sign in" link → sign in with an existing account that has an address. Expected: back in the open dialog with the address pre-selected; param stripped; refresh doesn't reopen.

- [ ] **Pass 4 — Signed-in flow regression:** Signed in, place an order end-to-end (address pre-selected → check consent → Place order). Expected: redirects to `/account/orders/<id>` as before.

- [ ] **Pass 5 — Existing auto-open rails:** Visit a product URL with `?reorder=1` appended while signed in. Expected: dialog auto-opens, param stripped. (If a thread with an "Order this piece" CTA is handy, verify the `?threadId=` path the same way.)

- [ ] **Final gate:** `npm run check` — all green. Then mark this plan's checkboxes done.

---

## Self-review notes

- **Spec coverage:** routing/auto-open (Task 1–2), GuestAuthPanel content + sign-up-leads (Task 2 Step 3), no-form-for-guests + Cancel-only footer (Task 2 Step 4), prop rename (Task 2 Steps 1/5), all four visual changes (Task 3), all five verification passes (Task 4). Edge cases in the spec require no code by design.
- **Type consistency:** `productPath: string` defined in Task 2 Step 1, consumed in Steps 3/4/5 under the same name. `guest` derived once, used in body + footer.
- **The "unchanged JSX" placeholders in Task 2 Step 4 are deliberate move-don't-retype instructions, not missing content** — the exact existing code is in `order-button.tsx:263-334`.
