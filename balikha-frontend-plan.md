# Balikha — Frontend Skeleton Plan

Companion to **`balikha-plan.md`** (the foundational plan covering Next.js scaffolding, database, and Better Auth). This document is about the visible product: design system, layouts, component library, and page skeletons.

---

## 1. Strategy: Skeleton First

Build every visible page as a static skeleton with stub data **before** wiring up the database or auth. Forms render but don't submit. Navigation works. Pages render server-side with realistic-looking content sourced from TypeScript stub files.

Why:

- **Catches layout problems early.** Padding, hierarchy, responsive breakpoints, and component composition issues are easier to spot when you're not also debugging a Drizzle query.
- **Decouples visual review from backend readiness.** The user can browse the prototype and give design feedback before you've written a single mutation.
- **Stub data forces the type contract.** Stubs use `InferSelectModel` from Drizzle, so when you swap to real data, TypeScript catches mismatches.
- **Faster iteration.** No DB round-trip, no auth dance, no "wait for migrations" — just `npm run dev` and reload.

The cost is throwaway-ish stub files, but those become useful test fixtures later.

This plan can run after **Phase 2** (database + auth wired) of the foundational plan, but doesn't depend on real data flowing yet.

---

## 2. Path Inventory

Routes the prototype exposes. Anything not listed is out of scope.

### Public
- `/` — home / browse
- `/shop/[artisanSlug]` — artisan storefront
- `/shop/[artisanSlug]/[productSlug]` — product detail
- `/sitemap.xml` — Next-generated
- `/robots.txt` — Next-generated

### Auth
- `/sign-in`
- `/sign-up`

### Dashboard (auth-protected via middleware)
- `/dashboard` — overview
- `/dashboard/become-seller` — onboarding for users without an artisan profile
- `/dashboard/catalogs` — list / manage catalogs
- `/dashboard/catalogs/new` — create catalog
- `/dashboard/catalogs/[id]` — catalog detail (its products)
- `/dashboard/catalogs/[id]/edit` — edit catalog metadata
- `/dashboard/products/new` — create product
- `/dashboard/products/[id]/edit` — edit product
- `/dashboard/settings` — shop settings

### API
- `/api/auth/[...all]` — Better Auth handler

### Out of scope (do not create)
- `/cart`, `/checkout`, `/orders`, `/account/orders`
- Buyer profile pages
- Admin/moderation routes

---

## 3. Design Language

A few principles, then concrete tokens.

### Principles
- **Editorial, not retail.** Whitespace, real typography hierarchy, products allowed to breathe. Closer to a gallery site than a generic marketplace grid.
- **Photos are the heroes.** Cards lean image-forward; copy is supporting cast.
- **Sans for UI, serif for editorial moments.** `var(--font-sans)` everywhere by default. Reach for `var(--font-serif)` on artisan bios, product titles on detail pages, hero copy. Two fonts, used with intent.
- **Asymmetry where it earns its keep.** Product detail is a 3:2 split (gallery wider than info). Avoids template feel.
- **Mobile-first.** Every page must work cleanly at 375px width. Layouts adapt at Tailwind's standard breakpoints — see "Responsive" below for specifics.

### Color tokens (Sampaguita & Sea)

Already settled. Drop into `app/globals.css`:

```css
:root {
  --background: 46 53% 98%;            /* #FDFCF7 */
  --foreground: 210 38% 16%;           /* #1A2B3A */
  --card: 0 0% 100%;
  --card-foreground: 210 38% 16%;
  --popover: 0 0% 100%;
  --popover-foreground: 210 38% 16%;

  --primary: 210 38% 16%;              /* navy — buttons, primary CTAs */
  --primary-foreground: 46 53% 98%;

  --secondary: 43 33% 90%;             /* oat — secondary buttons, surfaces */
  --secondary-foreground: 210 38% 16%;

  --muted: 43 33% 90%;
  --muted-foreground: 210 15% 38%;

  --accent: 2 56% 51%;                 /* Philippine red — badges, prices, links */
  --accent-foreground: 46 53% 98%;

  --destructive: 0 70% 35%;            /* deeper red, distinct from brand */
  --destructive-foreground: 46 53% 98%;

  --success: 151 40% 30%;
  --success-foreground: 46 53% 98%;
  --warning: 36 76% 39%;
  --warning-foreground: 46 53% 98%;

  --gold: 40 79% 59%;                  /* custom — sparingly, for "Limited" */

  --border: 40 30% 86%;
  --input: 40 30% 86%;
  --ring: 210 38% 16%;
  --radius: 0.5rem;
}
```

### Color rules (for Claude Code to follow)

- **`--primary` is for buttons and primary CTAs.** Navy. Not red.
- **`--accent` (brand red) is for prices, "Limited"/"Sale" badges, links, sale tags.** Never as a button background.
- **`--destructive` is the only red on a button.** Used for delete confirmations, account removal, etc.
- **`--gold` is custom and used sparingly.** Limited drops, the occasional hover glint, special badges. If it's on every page it loses meaning.

### Typography

- Default: `var(--font-sans)`, weight 400 body / 500 emphasis. Two weights, no 600/700.
- Editorial moments use `var(--font-serif)`:
  - Product titles on detail pages
  - Artisan names on storefront/profile cards
  - Hero copy
  - "About this piece" prose
- Type scale (Tailwind classes already cover this): `text-xs` 12px, `text-sm` 14px, `text-base` 16px, `text-lg` 18px, `text-xl` 20px, `text-2xl` 24px, `text-3xl` 30px, `text-4xl` 36px.
- Body line-height 1.6–1.7 for readability.

### Spacing

Stick to Tailwind's scale. Section spacing on public pages: `py-12` to `py-20` (mobile to desktop). Card internal padding: `p-4` to `p-6`. Don't invent custom px values; use the scale.

### Responsive

Tailwind's default breakpoints, used consistently:

| Prefix | Min width | Use case |
|---|---|---|
| (none) | 0 | Mobile baseline (375px target) |
| `sm:` | 640px | Large phones, small tablets |
| `md:` | 768px | Tablets portrait |
| `lg:` | 1024px | Tablets landscape, small laptops |
| `xl:` | 1280px | Desktop |

Rules of thumb:

- **Test at three widths**: 375px (iPhone), 768px (iPad portrait), 1280px (desktop). If those work, intermediate widths usually work.
- **Product grids**: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`. Two columns on mobile is the minimum — single column wastes horizontal space and feels claustrophobic for browsing.
- **Artisan/category cards**: `grid-cols-2 md:grid-cols-4`.
- **Asymmetric layouts (e.g. product detail's 3:2 split)**: stack vertically below `lg:` (gallery on top, info below). Don't try to maintain the split on tablets — it gets cramped.
- **Dashboard sidebar**: visible at `lg:` and up. Below `lg:`, collapses into a `<Sheet />` (shadcn) triggered by a hamburger button in the dashboard header.
- **Site header nav**: full nav at `md:` and up. Below `md:`, links collapse into a `<Sheet />` drawer.
- **Touch targets**: min `h-11` (44px) for any interactive element on mobile. shadcn `Button` defaults to `h-10` — bump to `h-11` on mobile primary CTAs.
- **Typography scale shifts**: hero headlines step up at breakpoints (e.g. `text-3xl md:text-4xl lg:text-5xl`). Body text stays `text-base` everywhere.
- **Section padding scales**: `py-12 md:py-16 lg:py-20` for major page sections.
- **Image sizing for performance**: Next `<Image>` with explicit `sizes` attribute on every responsive image. Product card example: `sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"`. Skipping `sizes` makes Next serve full-width images, which kills mobile performance.
- **Forms on mobile**: full width with `max-w-md` or `max-w-2xl` cap on larger screens. Inputs are `h-11` minimum.
- **Tables in dashboard lists**: become stacked cards below `md:` — each row collapses into a card with the same data, vertically arranged. Don't allow horizontal scroll on tables.
- **No horizontal scroll, ever.** If anything overflows at 375px, fix the layout — don't `overflow-x: scroll` on the body.

---

## 4. Component Library

### shadcn primitives to install

Run these in Phase A:

```bash
npx shadcn@latest add button input label textarea card form sheet dialog \
  dropdown-menu avatar badge separator skeleton tabs select
```

Anything else gets added when a page actually needs it. Don't pre-install.

### Custom layout components

Live in `components/layout/`. Each has its own folder with `index.tsx` and `*.module.css` for any custom styling that doesn't fit Tailwind.

| Component | Used on | Notes |
|---|---|---|
| `<SiteHeader />` | All public + auth pages | Logo, nav, sign-in/up CTAs, sticky on scroll |
| `<SiteFooter />` | All public pages | About, terms, contact links |
| `<DashboardHeader />` | All `/dashboard/*` | Different from site header — shows "View shop" link, avatar dropdown |
| `<DashboardSidebar />` | All `/dashboard/*` | Overview, Catalogs, Products, Orders, Settings |
| `<DashboardShell />` | All `/dashboard/*` | Composes header + sidebar + main content area |

### Custom domain components

Live in `components/`. Each gets a folder with `index.tsx` plus `*.module.css` if needed.

| Component | Props (rough) | Used on |
|---|---|---|
| `<ProductCard />` | `product`, `artisan` | Home, storefront, "more from artisan" |
| `<ArtisanCard />` | `artisan`, `productCount?` | Home featured section |
| `<ProductGrid />` | `products`, `cols?` | Wraps ProductCards in responsive grid |
| `<PriceTag />` | `price`, `currency`, `compareAt?` | Anywhere price displays |
| `<CatalogSection />` | `catalog`, `products` | Storefront — renders a catalog header + product grid |
| `<EmptyState />` | `title`, `description`, `cta?` | Dashboard empty lists |

---

## 5. Stub Data

A throwaway-ish data layer so pages render without DB.

### `lib/stubs/types.ts`

Re-export the Drizzle inferred types so stubs and real queries are interchangeable later:

```ts
import type { InferSelectModel } from 'drizzle-orm';
import type { artisanProfiles, catalogs, products, productImages } from '@/db/schema';

export type Artisan = InferSelectModel<typeof artisanProfiles>;
export type Catalog = InferSelectModel<typeof catalogs>;
export type Product = InferSelectModel<typeof products>;
export type ProductImage = InferSelectModel<typeof productImages>;

export type ProductWithImages = Product & { images: ProductImage[] };
export type ArtisanWithCatalogs = Artisan & {
  catalogs: (Catalog & { products: ProductWithImages[] })[];
};
```

### `lib/stubs/data.ts`

Hand-write 3–5 artisans, each with 1–2 catalogs and 4–8 products. Use placeholder images (e.g., `https://placehold.co/600x800/EFE9DC/1A2B3A?text=Vase`) or local files in `public/stubs/`. Use real-feeling names — "Maria Ceramics", "T'boli Weaves", "Narra Studio" — and Filipino context (Quezon City, Baguio, Davao).

### `lib/stubs/queries.ts`

Functions that mimic the eventual real query shape:

```ts
export async function getRecentProducts(limit = 12): Promise<ProductWithImages[]> { ... }
export async function getFeaturedArtisans(limit = 4): Promise<Artisan[]> { ... }
export async function getArtisanBySlug(slug: string): Promise<ArtisanWithCatalogs | null> { ... }
export async function getProductBySlug(
  artisanSlug: string,
  productSlug: string
): Promise<ProductWithImages | null> { ... }
```

These are async even though they return synchronously — keeps the call-site code identical to the real version. When you swap to real Drizzle queries, only the implementation changes, not the pages.

---

## 6. Page Skeletons

Plain-language description of each page. Claude Code uses these as the spec for the skeleton phase.

### `/` — Home / browse
Full-width hero with editorial headline (serif) and "Browse the catalog" CTA. Below: "Featured artisans" — 4-up grid of `<ArtisanCard />`. Below that: "Recent listings" — 4-up grid of `<ProductCard />` (8–12 items, no pagination yet). Footer.

**Responsive**: hero copy and CTA stack vertically on mobile. Featured artisans `grid-cols-2 md:grid-cols-4`. Recent listings `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`. Headline `text-3xl md:text-4xl lg:text-5xl`.

### `/shop/[artisanSlug]` — Artisan storefront
Banner image (16:4 aspect). Below banner: artisan info row — circular avatar, name (serif), location, short bio. Then catalogs as sections, each with title, optional "Limited" badge, item count, and a 4-up product grid. If a catalog has no products, hide it. Footer.

**Responsive**: banner shifts to `aspect-[16/6]` below `md:` (less wide, more visible). Artisan info row stacks below `md:` — avatar centered above name and bio, text-aligned center. Catalog product grids match home's pattern: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4`.

### `/shop/[artisanSlug]/[productSlug]` — Product detail
Top: breadcrumb `Shop › Artisan › Product`. Main: 3:2 grid. Left (3): primary image (1:1 aspect) + 4-up thumbnail strip. Right (2): product title (serif), "by [artisan]" link, price (large, brand red), "Limited" badge if applicable, description, "Add to cart" button (primary), specs table (materials, dimensions, weight). Below: "More from this artisan" — 4-up grid. Footer.

**Responsive**: 3:2 split applies only at `lg:` and up. Below `lg:`, the gallery and info stack vertically (full-width image + thumbnails first, info below). Thumbnail strip stays `grid-cols-4` regardless. Product title `text-2xl md:text-3xl`. "More from this artisan" uses `grid-cols-2 md:grid-cols-4`. "Add to cart" is `w-full` on mobile, `w-auto` from `md:` up.

**SEO requirements** (apply server-side via `generateMetadata`):
- `<title>`: `${product.title} — ${artisan.shopName} | Balikha`
- `<meta name="description">`: first 155 chars of product description
- Open Graph: title, description, primary image as `og:image`
- JSON-LD: `Product` + `Offer` schema with price, currency, availability

### `/sign-in` and `/sign-up`
Centered single-column card on neutral background. Logo top-center. Card contains form (email, password, name on signup), primary button, link to the other auth page. Forms validate but don't submit yet — log to console.

**Responsive**: card `max-w-md` centered. On mobile, card has `mx-4` for horizontal breathing room. Inputs and buttons `h-11`. Naturally responsive — no special handling beyond that.

### `/dashboard` — Overview
`<DashboardShell />` with sidebar and main. Main: 3 metric cards (products count, views 30d, sold). Below: "Recent products" card with 3–5 product rows showing thumbnail, title, status badge. Bottom: action buttons — "Add product" (primary), "New catalog" (outline).

**Responsive**: sidebar visible at `lg:` and up; below that, hidden behind a hamburger button in `<DashboardHeader />` that opens a `<Sheet />` drawer with the same nav items. Stats cards `grid-cols-1 sm:grid-cols-3` (stacked on small phones, in a row from `sm:` up — they're short enough). "Recent products" rows stay as rows (thumbnail + title + status fits horizontally even at 375px). Action buttons stack vertically (`flex-col sm:flex-row`) on mobile.

### `/dashboard/become-seller`
Shown when user has no artisan profile. Form fields: shop name, location, short bio, optional banner upload. On submit (stub): logs to console. Real action wires up later.

**Responsive**: form `max-w-2xl`, full-width on mobile with `px-4` padding. All inputs `h-11`.

### `/dashboard/catalogs`
Header: "Catalogs" + "New catalog" button. Below: table or card grid of catalogs — title, status badge, product count, edit/archive actions. Empty state when no catalogs.

**Responsive**: at `md:` and up, render as a table. Below `md:`, render as stacked cards — each catalog a card with title, status, count, and actions arranged vertically. Header buttons stack below `sm:`.

### `/dashboard/catalogs/[id]` and `/dashboard/catalogs/[id]/edit`
Detail page lists products in the catalog with their statuses. Edit page is a form with title, description, status, release/close dates.

**Responsive**: same table-vs-cards pattern as the catalog list. Edit form uses `max-w-2xl`, single column on all widths.

### `/dashboard/products/new` and `/dashboard/products/[id]/edit`
Form: catalog selector, title, description (textarea), price + currency, stock, materials (tag input), dimensions (width/height/depth/unit), weight, status (draft/published), images (file upload — saves to `public/uploads/` for now). On submit (stub): logs to console.

**Responsive**: form `max-w-2xl`, single column. Dimensions row (width/height/depth/unit) is `grid-cols-2 md:grid-cols-4`. Image upload area full-width.

### `/dashboard/settings`
Form to edit `artisan_profile`: shop name, slug (read-only display), bio, location, banner, policies.

**Responsive**: same form pattern — `max-w-2xl`, single column.

---

## 7. Phases

Each phase is a self-contained, committable unit.

### Phase A — Design tokens + layout shell

1. Paste the CSS tokens from §3 into `app/globals.css`.
2. Install shadcn primitives (§4).
3. Configure `tailwind.config.ts` to map shadcn tokens through (this is part of `shadcn init` already, just verify).
4. Add `var(--font-serif)` — pick a serif (e.g., Fraunces or Lora via `next/font`) and wire it into `app/layout.tsx`.
5. Build `<SiteHeader />`, `<SiteFooter />`, `<DashboardHeader />`, `<DashboardSidebar />`, `<DashboardShell />`.
6. Set up route groups: `app/(marketing)/`, `app/(auth)/`, `app/(dashboard)/`. Each gets its own `layout.tsx` that wraps the appropriate header/footer/shell.
7. The default `app/page.tsx` becomes a "hello world" hero just to verify routing — real home page comes in Phase B.

**Done when:** `/` shows a header + hero + footer using the palette, renders cleanly at 375px / 768px / 1280px, and the site header collapses to a `<Sheet />` drawer below `md:`. `npm run check` passes. Commit: `feat: design tokens, layout shell, route groups`.

### Phase B — Public route skeletons

1. Write `lib/stubs/types.ts`, `lib/stubs/data.ts`, `lib/stubs/queries.ts`.
2. Build `<ProductCard />`, `<ArtisanCard />`, `<ProductGrid />`, `<PriceTag />`, `<CatalogSection />`.
3. Implement `/` (home/browse) per §6.
4. Implement `/shop/[artisanSlug]` per §6.
5. Implement `/shop/[artisanSlug]/[productSlug]` per §6, including `generateMetadata` and JSON-LD.
6. Add `app/sitemap.ts` and `app/robots.ts` — reading from stub queries for now.

**Done when:** all three public routes render with stub data and look correct at 375px / 768px / 1280px (no horizontal scroll, grids reflow per §3 Responsive). View source on a product page shows real `<title>`, meta tags, OG, and JSON-LD. All product images use Next `<Image>` with explicit `sizes`. `npm run check` passes. Commit: `feat: public route skeletons with SEO`.

### Phase C — Auth route skeletons

1. Build `/sign-in` and `/sign-up` pages with shadcn form components.
2. Validate client-side with `zod` (already a Better Auth peer dep).
3. On submit: `console.log` payload, no real call yet.
4. Add a "Forgot password?" link that goes nowhere yet (placeholder).

**Done when:** both pages render and forms validate at 375px / 768px / 1280px. Commit: `feat: sign-in / sign-up skeletons`.

### Phase D — Dashboard route skeletons

1. Build `<EmptyState />`.
2. Implement `/dashboard` overview per §6 with stub data.
3. Implement `/dashboard/become-seller` form skeleton.
4. Implement `/dashboard/catalogs` (list) and `/dashboard/catalogs/new` (form).
5. Implement `/dashboard/catalogs/[id]` and `/dashboard/catalogs/[id]/edit`.
6. Implement `/dashboard/products/new` and `/dashboard/products/[id]/edit`.
7. Implement `/dashboard/settings`.

For now, the middleware in §`middleware.ts` of the foundational plan still redirects unauthenticated users to `/sign-in`. To work on dashboard pages without signing in every time, temporarily disable that matcher OR sign in once with the auth from foundational Phase 2.

**Done when:** every dashboard route renders at 375px / 768px / 1280px. Sidebar is visible at `lg:` and up; below `lg:`, hamburger button in `<DashboardHeader />` opens a `<Sheet />` drawer with the same nav. Catalog/product list tables collapse to stacked cards below `md:`. Forms log payloads on submit. Navigation between pages works. Commit: `feat: dashboard skeletons`.

---

## 8. After the Skeleton

Once the skeleton looks right and the user has reviewed it, the next round wires up real data. That's a separate plan (or a continuation of the foundational plan's Phase 3+). The order will be roughly:

1. Real auth on `/sign-in`, `/sign-up` (replace stub submit handlers)
2. Real `become-seller` server action
3. Real catalog CRUD
4. Real product CRUD with image upload
5. Replace `lib/stubs/queries.ts` callers with real Drizzle queries on public pages
6. Delete `lib/stubs/` once nothing imports from it

Each step swaps a stub for a real implementation, route by route. The visual layer doesn't change.

---

## 9. Conventions Reminder

(Repeated from foundational plan §7 because Claude Code will reference this doc directly.)

- Server components by default. `"use client"` only when interaction or hooks demand it.
- Server actions for mutations (when wired up in the post-skeleton phase). API routes only for the Better Auth handler.
- Money formatting goes through one `formatPrice(value: string, currency: string)` helper.
- All authorization re-fetches the resource server-side and checks ownership against the session.
- No `any`. No 600/700 font weights. No hardcoded colors — use the CSS variables.
- **Test every page at 375px / 768px / 1280px before any commit.** No horizontal scroll, ever. Grids reflow per §3 Responsive.
- Every Next `<Image>` includes a `sizes` attribute matched to its responsive layout.

---

## 10. Quick start for Claude Code

```bash
# foundational plan should already be at Phase 2 or beyond
npm run dev
```

Start with Phase A. Don't merge phases. Run `npm run check` before each commit.
