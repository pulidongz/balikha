# Auth Pages Revamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editorial split layout for all auth pages (featured-work photo panel), a shared in-field password show/hide toggle with fixed tab order, and brand-finished reset-password dead-end states.

**Architecture:** The split shell lands once in `app/(auth)/layout.tsx` (async server component; media resolved by a new `getAuthPanelMedia()` query with an explicit fallback chain). A new `PasswordInput` component (lucide `Eye`/`EyeOff` rendered AFTER the input in DOM) replaces the label-row `Show` links in sign-in/sign-up and the plain password inputs in reset-password; `Forgot password?` moves below its field. Spec: `docs/superpowers/specs/2026-06-12-auth-pages-revamp-design.md`.

**Tech Stack:** Next.js App Router server components, `next/image` (remotePatterns already configured in `next.config.*`), lucide-react (already a dependency), shadcn-style primitives (`Input`, `Button`, `Card*`), Tailwind v4.

**Verification model:** No component-test framework; gates are `npm run check` (tsc + eslint + prettier, zero warnings) per task plus manual browser passes at the end. Branch: `feature/auth-pages-revamp` (already checked out; spec committed). Do NOT push until the final task.

**Files touched (whole plan):**

- Create: `lib/queries/auth-panel.ts`, `components/auth/password-input.tsx`
- Modify: `app/(auth)/layout.tsx`, `components/auth/sign-in-form.tsx`, `components/auth/sign-up-form.tsx`, `app/(auth)/reset-password/reset-password-form.tsx`, `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/page.tsx`, `docs/superpowers/specs/2026-06-12-auth-pages-revamp-design.md` (fallback-3 amendment)

---

### Task 1: `getAuthPanelMedia()` — the media fallback chain

**Files:**

- Create: `lib/queries/auth-panel.ts`

- [ ] **Step 1: Write the query helper**

```ts
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { artisanProfiles, productImages, products } from '@/db/schema';
import { getEditorialFeature } from '@/lib/queries/editorial-feature';

export interface AuthPanelMedia {
  imageUrl: string;
  workTitle: string;
  shopName: string;
}

// Photo for the auth pages' editorial side panel. Chain, each step
// explicit: founder-curated homepage feature → newest published work →
// null (the layout renders the navy brand panel without a photo).
// Never an empty/broken panel.
export async function getAuthPanelMedia(): Promise<AuthPanelMedia | null> {
  const feature = await getEditorialFeature();
  const featured = feature?.works.find((w) => w.primaryImage !== null);
  if (featured?.primaryImage) {
    return {
      imageUrl: featured.primaryImage.url,
      workTitle: featured.title,
      shopName: featured.artisanShopName,
    };
  }

  const [newest] = await db
    .select({
      title: products.title,
      shopName: artisanProfiles.shopName,
      imageUrl: productImages.url,
    })
    .from(products)
    .innerJoin(artisanProfiles, eq(artisanProfiles.id, products.artisanProfileId))
    .innerJoin(productImages, eq(productImages.productId, products.id))
    .where(eq(products.status, 'published'))
    .orderBy(desc(products.createdAt), asc(productImages.position))
    .limit(1);
  if (!newest) return null;
  return { imageUrl: newest.imageUrl, workTitle: newest.title, shopName: newest.shopName };
}
```

VERIFY the join column names against `db/schema/app.ts` before accepting this code (e.g. `products.artisanProfileId` — if the schema names it differently, follow the schema; `lib/queries/editorial-feature.ts` has working joins to copy from). Do NOT cast or guess.

- [ ] **Step 2: Gates**

Run: `npm run check` — fully green, zero warnings.

- [ ] **Step 3: Commit**

```bash
git add lib/queries/auth-panel.ts
git commit -m "feat(auth): media fallback chain for auth panel"
```

---

### Task 2: The split shell in `app/(auth)/layout.tsx` (+ spec amendment)

**Files:**

- Modify: `app/(auth)/layout.tsx` (currently 16 lines — full rewrite below)
- Modify: `docs/superpowers/specs/2026-06-12-auth-pages-revamp-design.md` (fallback 3)

- [ ] **Step 1: Rewrite the layout**

```tsx
import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getAuthPanelMedia } from '@/lib/queries/auth-panel';

// Two-pane editorial shell for every (auth) page: form on cream at left,
// featured-work photo at right (lg+ only). Media comes from the founder-
// curated feature with fallbacks (see getAuthPanelMedia); when there is
// no photo at all, the panel is the navy brand statement alone.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const media = await getAuthPanelMedia();
  return (
    <main className="flex min-h-screen">
      <div className="bg-background flex flex-1 flex-col items-center justify-center px-4 py-12">
        <Link
          href="/"
          className="text-foreground/80 hover:text-foreground mb-8 font-serif text-2xl tracking-tight transition-colors"
        >
          Balikha
        </Link>
        <div className="w-full max-w-md">{children}</div>
      </div>
      {/* Decorative panel — atmosphere, not navigation. Hidden below lg. */}
      <aside aria-hidden="true" className="bg-primary relative hidden lg:block lg:w-[44%]">
        {media && (
          <Image
            src={media.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 44vw, 0px"
            className="object-cover"
          />
        )}
        <div className="from-primary/10 to-primary/70 absolute inset-0 bg-gradient-to-b" />
        <div className="absolute right-8 bottom-8 left-8">
          <p className="text-primary-foreground font-serif text-2xl tracking-tight">
            Handmade, from the Philippines.
          </p>
          {media && (
            <p className="text-primary-foreground/75 mt-1 text-sm">
              {media.workTitle} · {media.shopName}
            </p>
          )}
        </div>
      </aside>
    </main>
  );
}
```

Tailwind v4 note: check how existing code writes vertical gradients (`grep -rn "gradient" app components | head`) — if the repo uses `bg-linear-to-b` (v4 canonical) instead of `bg-gradient-to-b`, match the repo's form.

- [ ] **Step 2: Amend the spec's fallback 3**

In `docs/superpowers/specs/2026-06-12-auth-pages-revamp-design.md`, replace the media-pipeline item:

```
3. Empty platform → committed brand photo in `public/` (founder's own
   photography; file chosen at implementation) with the brand line, no
   credit.
```

with:

```
3. Empty platform → navy brand panel (`bg-primary`) with the serif brand
   line and no photo. (Amended from "committed brand photo" during
   implementation: no rights-cleared asset exists to commit, the case is
   reachable only on an empty database, and a navy panel can never render
   as a broken image.)
```

- [ ] **Step 3: Render check + gates**

With the dev server running (the user usually has one on :3000), load `/sign-in` at a wide viewport: split renders with a photo + credit; at a narrow viewport the photo pane disappears. `curl -s http://localhost:3000/sign-in | grep -c "Handmade, from the Philippines"` should print ≥1.
Run: `npm run check` — fully green.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/layout.tsx" "docs/superpowers/specs/2026-06-12-auth-pages-revamp-design.md"
git commit -m "feat(auth): editorial split shell for auth pages"
```

---

### Task 3: `PasswordInput` + the three form swaps

**Files:**

- Create: `components/auth/password-input.tsx`
- Modify: `components/auth/sign-in-form.tsx`, `components/auth/sign-up-form.tsx`, `app/(auth)/reset-password/reset-password-form.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'>;

// Password field with an in-field visibility toggle. The button sits
// AFTER the input in DOM order so Tab flows field → toggle → next
// control (never before the field), and stays keyboard-focusable —
// screen-reader and keyboard users get the toggle too.
export function PasswordInput({ className, ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}
```

(Check `components/ui/input.tsx`'s props type — if it's `React.ComponentProps<typeof Input>` style rather than `'input'`, mirror it. `cn` lives in `lib/utils.ts`.)

- [ ] **Step 2: Sign-in form** (`components/auth/sign-in-form.tsx`)

Delete the `showPassword` state (line ~35) and replace the whole password block (lines ~126–155) with:

```tsx
<div className="space-y-2">
  <Label htmlFor="signin-password">Password</Label>
  <PasswordInput
    id="signin-password"
    name="password"
    value={password}
    onChange={(e) => setPassword(e.target.value)}
    required
    autoComplete="current-password"
    className="h-11"
  />
  <p className="text-right">
    <Link
      href="/forgot-password"
      className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
    >
      Forgot password?
    </Link>
  </p>
</div>
```

Import `PasswordInput`; drop the now-unused `Input` import only if nothing else in the file uses it (the email field does — keep it).

- [ ] **Step 3: Sign-up form** (`components/auth/sign-up-form.tsx`)

Same surgery: delete `showPassword` state (line ~39), replace the label-row-with-Show + password `Input` (lines ~204–225 region) with a plain `<Label htmlFor="signup-password">Password</Label>` followed by a `PasswordInput` carrying the existing props (`id`, `name`, `value`, `onChange`, `required`, `autoComplete="new-password"`, and whatever className/minLength the current input has — preserve them exactly). No forgot-password link here.

- [ ] **Step 4: Reset-password form** (`app/(auth)/reset-password/reset-password-form.tsx`)

Swap both password `Input`s (new + confirm, lines ~114 and ~128) for `PasswordInput`, preserving each field's existing props. Each field gets its own independent toggle (that's inherent — state lives inside the component).

- [ ] **Step 5: Gates + commit**

Run: `npm run check` — fully green, zero warnings.

```bash
git add components/auth/password-input.tsx components/auth/sign-in-form.tsx components/auth/sign-up-form.tsx "app/(auth)/reset-password/reset-password-form.tsx"
git commit -m "feat(auth): in-field password toggle and natural tab order"
```

---

### Task 4: Card polish + reset-password dead ends

**Files:**

- Modify: `app/(auth)/sign-in/page.tsx`, `app/(auth)/sign-up/page.tsx`, `app/(auth)/reset-password/reset-password-form.tsx`

- [ ] **Step 1: Vermilion tick under the card headings**

In `app/(auth)/sign-in/page.tsx`, inside `CardHeader` directly after `CardTitle`:

```tsx
        <CardTitle className="font-serif text-2xl">Welcome back</CardTitle>
        <div aria-hidden="true" className="bg-accent h-0.5 w-9 rounded-full" />
```

Same insertion in `app/(auth)/sign-up/page.tsx` after its `CardTitle`. In the reset-password form's valid-token state, after the `<h1 className="font-serif text-2xl tracking-tight">Choose a new password</h1>` add:

```tsx
<div aria-hidden="true" className="bg-accent mt-2 h-0.5 w-9 rounded-full" />
```

(Match each file's actual structure — if `CardDescription` spacing looks cramped in the render check, a `mt-1` on the tick is fine. Keep it consistent across the three.)

- [ ] **Step 2: Restyle `ResetLinkError`**

In `app/(auth)/reset-password/reset-password-form.tsx`, the dead-end view (function at ~line 15) becomes:

```tsx
import { CircleAlert } from 'lucide-react';

// Shared dead-end view for an expired / incomplete reset link: a calm mark
// (oat disc + driftwood icon, not alarm-red — an expired link isn't a
// destructive event), the brand serif + tick, and the primary action
// styled as primary.
function ResetLinkError({ title, body }: { title: string; body: string }) {
  return (
    <div className="space-y-4 py-2 text-center">
      <div className="bg-secondary mx-auto flex size-12 items-center justify-center rounded-full">
        <CircleAlert className="text-muted-foreground size-6" aria-hidden="true" />
      </div>
      <div>
        <h1 className="font-serif text-2xl tracking-tight">{title}</h1>
        <div aria-hidden="true" className="bg-accent mx-auto mt-3 h-0.5 w-9 rounded-full" />
      </div>
      <p className="text-muted-foreground text-sm">{body}</p>
      <Button size="lg" className="w-full" render={<Link href="/forgot-password" />}>
        Request a new link
      </Button>
      <Link
        href="/sign-in"
        className="text-muted-foreground hover:text-foreground block text-sm underline-offset-4 hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  );
}
```

Adapt to the file's existing structure: it already uses the `render={<Link …/>}` Button pattern (~line 28) — keep that idiom; the change is variant (outline → default/primary), the disc/icon, and the tick. Copy/titles/bodies and the `?error=INVALID_TOKEN` branching stay byte-identical.

- [ ] **Step 3: Gates + commit**

Run: `npm run check` — fully green.

```bash
git add "app/(auth)/sign-in/page.tsx" "app/(auth)/sign-up/page.tsx" "app/(auth)/reset-password/reset-password-form.tsx"
git commit -m "feat(auth): vermilion tick polish and reset dead-end finish"
```

---

### Task 5: Verification + PR (controller; no merge)

- [ ] **Pass 1 — Tab order (sign-in):** email → password → eye toggle → forgot link → Turnstile → Sign in. Nothing between email and password.
- [ ] **Pass 2 — Eye toggle:** masks/unmasks on sign-in, sign-up, and both reset-password fields independently.
- [ ] **Pass 3 — Split media:** `/sign-in` wide shows photo + credit (current feature or newest work); narrow shows single column. (Empty-DB navy fallback is dev-only; verify by code review.)
- [ ] **Pass 4 — Round trips:** sign-in and sign-up complete end-to-end incl. `?next=` redirects.
- [ ] **Pass 5 — Reset dead ends:** `/reset-password` (no token) and `/reset-password?error=INVALID_TOKEN` render the new treatment; `Request a new link` is the navy primary.
- [ ] **Final gate:** `npm run check` green → `git push -u origin feature/auth-pages-revamp` → `gh pr create` (summary: split shell + media chain, PasswordInput + tab order, tick polish, reset dead ends) → do NOT merge; user reviews.

---

## Self-review notes

- **Spec coverage:** shell + media chain (Tasks 1–2, incl. the fallback-3 amendment), PasswordInput + DOM-order tab fix + forgot relocation (Task 3), tick polish + dead-end finish (Task 4), all six manual passes (Task 5, pass 3 folds two spec checks together).
- **Type consistency:** `AuthPanelMedia { imageUrl, workTitle, shopName }` defined Task 1, consumed Task 2 as `media.imageUrl/workTitle/shopName`. `PasswordInput` props = input props minus `type`, consumed with existing field props in Task 3.
- **Deliberate verify-don't-trust spots:** join column names (Task 1), gradient utility naming (Task 2), Input props type + Button render idiom (Tasks 3–4) — each has an explicit check instruction rather than a guess.
