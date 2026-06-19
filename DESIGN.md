---
name: Balikha
description: An editorial marketplace for handmade work by independent Filipino artisans.
colors:
  sampaguita-cream: '#FDFCF7'
  deep-sea-navy: '#1A2B3A'
  shell-white: '#FFFFFF'
  oat: '#EEE9DD'
  driftwood: '#52616F'
  philippine-vermilion: '#C8413C'
  deep-ember: '#981B1B'
  forest: '#2E6B4E'
  burnt-amber: '#AF7318'
  heirloom-gold: '#E9B244'
  shoreline-sand: '#E6DFD1'
typography:
  display:
    fontFamily: 'Fraunces, Georgia, serif'
    fontSize: 'clamp(2.25rem, 5vw, 3.75rem)'
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: '-0.02em'
  headline:
    fontFamily: 'Fraunces, Georgia, serif'
    fontSize: '1.875rem'
    fontWeight: 400
    lineHeight: 1.2
    letterSpacing: '-0.01em'
  title:
    fontFamily: 'Fraunces, Georgia, serif'
    fontSize: '1.25rem'
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 'normal'
  body:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.65
    letterSpacing: 'normal'
  label:
    fontFamily: 'Geist, system-ui, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: 'normal'
rounded:
  sm: '0.3rem'
  md: '0.4rem'
  lg: '0.5rem'
  xl: '0.7rem'
  pill: '1.3rem'
spacing:
  inset: '16px'
  gutter: '24px'
  section: '64px'
  section-xl: '112px'
components:
  button-primary:
    backgroundColor: '{colors.deep-sea-navy}'
    textColor: '{colors.sampaguita-cream}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  button-secondary:
    backgroundColor: '{colors.oat}'
    textColor: '{colors.deep-sea-navy}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  button-outline:
    backgroundColor: '{colors.sampaguita-cream}'
    textColor: '{colors.deep-sea-navy}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '0 10px'
    height: '32px'
  input-default:
    backgroundColor: 'transparent'
    textColor: '{colors.deep-sea-navy}'
    typography: '{typography.label}'
    rounded: '{rounded.lg}'
    padding: '4px 10px'
    height: '32px'
  badge-default:
    backgroundColor: '{colors.deep-sea-navy}'
    textColor: '{colors.sampaguita-cream}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    height: '20px'
  badge-limited:
    backgroundColor: '{colors.heirloom-gold}'
    textColor: '{colors.deep-sea-navy}'
    rounded: '{rounded.pill}'
    padding: '2px 8px'
    height: '20px'
  card:
    backgroundColor: '{colors.shell-white}'
    textColor: '{colors.deep-sea-navy}'
    rounded: '{rounded.xl}'
    padding: '16px'
---

# Design System: Balikha

## 1. Overview

**Creative North Star: "The Maker's Table"**

Balikha lays each artisan's work out as if on a craftsperson's workbench: warm,
grounded, and close enough that you can almost see the hands behind it. The
system is warm-toned and unhurried. It frames handmade objects the way a gallery
frames an artist's work, but it never goes cold or white-cube about it. Paper
warmth, not screen glare.

The surface recedes so the craft can lead. Photography is the hero of every
storefront screen; chrome is hairline-thin; type does its work through scale and
through one well-earned switch into a serif, not through heavy weights or loud
color. Color is restrained: a warm cream field, a deep navy that carries every
action, and a single Philippine vermilion that appears only as a highlight.
Motion is small and physical, a button that presses down a pixel, a product
photo that breathes a few percent larger under the cursor.

This system explicitly rejects the marketplaces it is built against. It is not a
**big-box marketplace** (no cramped grids, no star-rating noise, no "only 2
left!" scarcity). It is not an **Etsy-style craft feed** (no discount banners,
no badge-heavy cards, no infinite homogenous grid where every listing screams
equally). It is not a **loud DTC startup** (no gradient-soaked surfaces, no
oversized type, no emoji, no popups or exit-intent modals). Editorial, not
retail: the product should feel browsed, not pushed.

**Key Characteristics:**

- **Warm and tactile.** Cream field, soft 8px to 11px radii, a 1px press nudge.
- **Photo-forward.** Storefront product imagery sits in bare containers, no card chrome competing with it.
- **Restrained color.** Navy carries every action; vermilion is a highlight only; gold is rare.
- **Two fonts, used with intent.** Geist for the interface, Fraunces for editorial moments.
- **Flat by default.** Depth comes from a hairline ring, never a drop shadow.
- **Mobile-first.** Every layout works at 375px. Containers cap at `max-w-6xl`; sections breathe with `64px` to `112px` of vertical rhythm.

## 2. Colors

A warm, paper-toned palette: a cream field, a single deep navy that does the
structural work, and one saturated red held in reserve as a highlight. Tokens
are defined as HSL in `app/globals.css`; hex equivalents are given here.

### Primary

- **Deep Sea Navy** (#1A2B3A): The structural color and the only button fill on
  the storefront. Body headings, primary CTAs, the logo wordmark, the focus
  ring, and default badges. It does the heavy lifting so red does not have to.

### Secondary

- **Philippine Vermilion** (#C8413C): The single accent. Prices, text links,
  product-title hover, and "Sale" / "Limited" badges. It is type and small
  marks only. It never fills a button.

### Tertiary

- **Heirloom Gold** (#E9B244): A rare warm note reserved for genuinely limited
  drops and special moments. Used on a handful of screens at most.

### Neutral

- **Sampaguita Cream** (#FDFCF7): The page field. Warm, low-glare, the
  background of nearly every surface.
- **Shell White** (#FFFFFF): Raised app surfaces only, the `Card` and dialog
  bodies inside the dashboard. The storefront stays on cream.
- **Oat** (#EEE9DD): Secondary buttons, muted fills, image placeholders, and the
  empty frame behind a product photo while it loads.
- **Shoreline Sand** (#E6DFD1): Hairline borders, input strokes, dividers.
- **Driftwood** (#52616F): Muted text, captions, the artisan name under a
  product, response-time lines. A grey-blue, never a flat grey.

### Functional

- **Deep Ember** (#981B1B): The only red permitted on a button, and only for
  destructive confirmations (delete, account removal). Distinct from vermilion
  so a destructive action never reads as a brand moment.
- **Forest** (#2E6B4E): Success states and confirmations.
- **Burnt Amber** (#AF7318): Warnings and pending states.

### Named Rules

**The Navy-Carries-the-Click Rule.** Every button and primary CTA is Deep Sea
Navy. Vermilion never fills a button. The one exception is Deep Ember on a true
destructive action.

**The Vermilion-Is-a-Highlight Rule.** Philippine Vermilion marks prices, links,
and "Sale" / "Limited" badges. It is always type or a small mark, never a
surface. If vermilion is filling a large area, it is being misused.

**The Gold-Is-Rare Rule.** Heirloom Gold appears only on genuinely limited drops
and special moments. If it shows up on every screen it has lost its meaning.

## 3. Typography

**Display Font:** Fraunces (with Georgia, serif fallback)
**Body Font:** Geist (with system-ui, sans-serif fallback)
**Label/Mono Font:** Geist Mono (with ui-monospace fallback), available for
order IDs and other machine values; not part of the reading hierarchy.

**Character:** Geist is a clean, level-headed grotesque that keeps the interface
quiet and legible. Fraunces is a soft, slightly old-style serif with warmth in
its curves. The pairing is the personality in two fonts: Geist is the calm
shopkeeper, Fraunces is the maker telling the story.

### Tokenized Type Scale

All sizes are defined as CSS custom properties under `@theme` in `app/globals.css`
and auto-generate Tailwind utilities (`text-display`, `text-headline`, etc.).
Use the utility class names — never hard-code a `font-size` value.

| Token             | Utility         | Value                                   | Line-height | Tracking |
| ----------------- | --------------- | --------------------------------------- | ----------- | -------- |
| `--text-display`  | `text-display`  | `clamp(2.75rem, 1.6rem + 5vw, 4.75rem)` | 1.03        | −0.03em  |
| `--text-headline` | `text-headline` | `clamp(2rem, 1.5rem + 1.8vw, 2.75rem)`  | 1.12        | −0.02em  |
| `--text-title`    | `text-title`    | `1.375rem`                              | 1.3         | −0.01em  |
| `--text-lead`     | `text-lead`     | `1.25rem`                               | 1.5         | —        |
| `--text-body`     | `text-body`     | `1.0625rem`                             | 1.65        | —        |
| `--text-label`    | `text-label`    | `0.875rem`                              | 1.4         | —        |
| `--text-caption`  | `text-caption`  | `0.75rem`                               | 1.4         | —        |

Display and Headline are fluid clamps. Title and below are fixed.

### Hierarchy

- **Display** (`text-display`, Fraunces 400, `clamp(2.75rem, 1.6rem + 5vw, 4.75rem)`,
  line-height 1.03): Hero copy on the home and storefront pages. Tracking pulled
  in (`-0.03em`).
- **Headline** (`text-headline`, Fraunces 400, `clamp(2rem, 1.5rem + 1.8vw, 2.75rem)`,
  line-height 1.12): Section titles ("Featured artisans", "Recent listings").
  Tracking pulled in (`-0.02em`).
- **Title** (`text-title`, Fraunces 500, `1.375rem`, line-height 1.3): Product
  titles on detail pages, artisan names on storefront cards, "About this piece"
  lead lines. Note: in-card titles in the dashboard (`CardTitle`) use Geist at
  `1rem`, weight 500, by design. The serif title is for editorial surfaces.
- **Lead** (`text-lead`, Geist 400, `1.25rem`, line-height 1.5): Intro paragraphs,
  "About this piece" opening lines.
- **Body** (`text-body`, Geist 400, `1.0625rem`, line-height 1.65): All running
  copy. Cap measure with `max-w-copy` (65ch).
- **Label** (`text-label`, Geist 500, `0.875rem`, line-height 1.4): Buttons,
  inputs, navigation, form labels.
- **Caption** (`text-caption`, Geist 500, `0.75rem`, line-height 1.4): Badges
  and fine captions.

### Named Rules

**The Two-Weight Rule.** Geist runs at 400 for body and 500 for emphasis.
Nothing heavier. No 600, no 700. Hierarchy comes from size and from switching to
Fraunces, never from weight.

**The Serif-Is-Earned Rule.** Fraunces appears only on editorial moments: hero
copy, section headlines, product titles on detail pages, artisan names, and
long-form "about" prose. Everything else, including every control and every
table, is Geist. Fraunces is loaded at weights 400 and 500 only.

### Reading Measures

Two container tokens cap line length to comfortable reading widths:

- `max-w-lead` (46ch): Intro paragraphs, pull-quotes, short descriptive leads.
- `max-w-copy` (65ch): Long-form body prose, "about" descriptions, policy text.

Both are defined under `@theme` in `app/globals.css` as `--container-lead` and
`--container-copy`, auto-generating `max-w-lead` and `max-w-copy` utilities.

## 3a. Spacing

Section vertical rhythm uses fluid tokens that scale between viewport breakpoints.
All are defined under `@theme` in `app/globals.css` and auto-generate `py-*`
utilities.

| Token                  | Utility         | Value                     | Range    |
| ---------------------- | --------------- | ------------------------- | -------- |
| `--spacing-section`    | `py-section`    | `clamp(4rem, 6vw, 7rem)`  | 64→112px |
| `--spacing-section-lg` | `py-section-lg` | `clamp(5rem, 9vw, 10rem)` | 80→160px |

Use `py-section` on all below-the-fold marketing sections. Use `py-section-lg`
on the hero / primary billboard area only.

In addition, four live CSS variables (in `:root`, not `@theme`) control motion
timing for CSS-only hover and press effects:

| Variable        | Value | Role                                  |
| --------------- | ----- | ------------------------------------- |
| `--dur-reveal`  | 600ms | Base scroll-reveal duration           |
| `--dur-hover`   | 520ms | Image/card hover transition           |
| `--dur-press`   | 120ms | Button press nudge                    |
| `--reveal-rise` | 24px  | Vertical offset for reveal animations |
| `--stagger-gap` | 90ms  | Delay between staggered grid items    |

## 4. Motion

Balikha's motion system delivers liveliness in three tiers without impacting
bundle weight or RSC boundaries.

### Architecture

- **Bundle:** `LazyMotion` + the lightweight `m` component + `domAnimation`
  (~4.6 kB) via `MotionProvider` in the root layout. The full `motion` import
  (~34 kB) is never loaded. The `strict` flag throws if any `motion.*` primitive
  slips into a component.
- **RSC boundary:** Motion components (`MotionProvider`, `Reveal`,
  `StaggerGrid`, `StaggerGridItem`) are `'use client'` and animate only their
  own wrapper element. Server-rendered `children` pass through and keep
  rendering on the server — no data-fetching file ever becomes a client
  component to add an animation.
- **Reduced motion:** Every primitive calls `useReducedMotion()` and renders a
  plain HTML element (snapping to the final state) when the OS setting is on.

### Easing Tokens

Two easing curves are available as CSS custom properties (also utilities via
`@theme`):

- `--ease-quart` / `ease-quart`: `cubic-bezier(0.23, 1, 0.32, 1)` — soft,
  over-damped settle. Default for sections, grids, and product-register
  surfaces.
- `--ease-overshoot` / `ease-overshoot`: `cubic-bezier(0.34, 1.3, 0.64, 1)` —
  slight spring past the resting point. Reserved for hero accents only.

### Primitives

**`<Reveal>`** (`components/motion/reveal.tsx`) — block-level scroll reveal.
Fades and rises into view once when the element enters the viewport.

- `variant="soft"` (default): 24px rise, quart ease — sections, content blocks.
- `variant="section"`: 24px rise, overshoot ease — hero accents only.
- `variant="subtle"`: 12px rise, quart ease — product register light entrance.
- `delay` (seconds): optional stagger for sibling reveals.

**`<StaggerGrid>` / `<StaggerGridItem>`** (`components/motion/stagger.tsx`) —
animated `<ul>` / `<li>` pair that staggers its children into view. Used via
`<ProductGrid stagger>`.

### Tiered Liveliness

| Tier             | Surface                            | Variants used                                                                         |
| ---------------- | ---------------------------------- | ------------------------------------------------------------------------------------- |
| Brand / hero     | Editorial landing, storefront hero | `section` (overshoot) for accents; `soft` for content blocks                          |
| Brand / sections | Below-fold marketing sections      | `soft` reveal; `stagger` on product grids                                             |
| Product register | Dashboard, account, admin          | `subtle` reveal for page headers only; data tables and dense lists are never animated |

### Named Rules

**Never reveal-gate above-the-fold content.** Hero text, the primary CTA, and
the product buy path render immediately at full opacity. No JS-gated `opacity:0`
can flash blank for users on slow connections. Reveals begin below the fold.

**Overshoot is for accents, not full sections.** The `section`/overshoot variant
is reserved for one or two hero accent elements per page. Section blocks and
product grids use `soft` (quart) to settle without bouncing.

**Hover and press stay CSS.** Card image scale on hover and the 1px button
nudge on press are pure CSS transitions using `--dur-hover` and `--dur-press`.
They do not use Motion primitives.

## 5. Elevation

The system is flat. There are no `box-shadow` tokens, and surfaces do not lift
off the page. Depth and grouping are conveyed two ways: a hairline 1px ring at
`Deep Sea Navy / 10%` opacity around raised app surfaces (cards, dialogs), and a
1px Shoreline Sand border on inputs and dividers. Tonal layering does the rest:
cream is the field, Shell White is a raised surface, Oat is a recessed fill.

The single intentional blur in the system is the dialog scrim
(`backdrop-blur-xs` over a 10% black wash). It is the one place glass is
allowed, because separating a modal from the page behind it is a real job.
Nowhere else.

Feedback is physical rather than elevated: a button nudges down 1px on
`:active`, and a product photo scales to 103% on hover. The page never casts a
shadow to fake importance.

### Named Rules

**The Hairline Rule.** Surfaces are flat at rest. Separation comes from a 1px
ring or a 1px Shoreline Sand border, never from a drop shadow. If a surface
needs a shadow to read, the layout is wrong.

## 6. Components

Components are **warm and tactile**: soft radii, compact controls, gentle
physical feedback. They feel handled rather than clicked.

### Buttons

- **Shape:** Gently rounded (`rounded-lg`, 8px). Border is a 1px transparent
  stroke at rest so variants can swap in a visible border without shifting
  layout.
- **Sizes:** Compact by default. `default` 32px tall, `sm` 28px, `lg` 36px, `xs`
  24px, plus square `icon` variants. Padding is tight (`0 10px` on `default`).
- **Primary:** Deep Sea Navy fill, Sampaguita Cream text. Hover drops the fill to
  80% opacity.
- **Secondary:** Oat fill, navy text. **Outline:** cream fill, Shoreline Sand
  border, navy text, Oat on hover. **Ghost:** transparent, Oat fill on hover.
  **Link:** navy text, underline on hover. **Destructive:** Deep Ember text on a
  pale 10% Ember tint, the only red button.
- **Hover / Focus:** `transition-all`. Focus shows a 3px ring at `navy / 50%`
  plus a navy border. Press nudges the button down 1px (`translate-y-px`).

### Chips / Badges

- **Style:** Full pill (`rounded-4xl`, 1.3rem radius on a 20px-tall badge), 12px
  Geist at weight 500, 2px by 8px padding.
- **Variants:** `default` navy, `secondary` Oat, `destructive` (Deep Ember on a
  tint), `outline`, `ghost`, `link`. A "Limited" badge uses Heirloom Gold with
  navy text.
- **Use:** Status and order state, "Sale" and "Limited" tags. Badges label, they
  do not decorate. One badge per card at most.

### Cards / Containers

- **Corner Style:** `rounded-xl` (0.7rem, roughly 11px).
- **Background:** Shell White, with navy text.
- **Shadow Strategy:** None. A 1px ring at `navy / 10%` (see Elevation). The
  `CardFooter` sits on a 50% Oat wash with a top border.
- **Internal Padding:** `16px` (`py-4 px-4`), `gap-4` between blocks. A `sm`
  size drops to `12px`.
- **Scope:** Cards belong to the dashboard, account, and admin surfaces. The
  storefront avoids them (see the signature component below).

### Inputs / Fields

- **Style:** `rounded-lg` (8px), 1px Shoreline Sand border, transparent
  background, 32px tall, `4px 10px` padding. Placeholder text is Driftwood.
- **Focus:** Border shifts to navy, plus a 3px `navy / 50%` ring.
- **Error / Disabled:** `aria-invalid` swaps the border to Deep Ember with a 3px
  Ember-tint ring. Disabled drops opacity and shows a not-allowed cursor. Text
  is 16px on mobile (prevents iOS zoom on focus), 14px from `md` up.

### Navigation

- **Site header:** Sticky, 56px tall (`h-14`), Sampaguita Cream at 95% opacity
  with a subtle `backdrop-blur` and a bottom border. The "Balikha" wordmark is
  Fraunces at 20px. A search bar claims the center column from `md` up; below
  `md` it collapses to a search icon and the nav folds into a `Sheet` drawer.
  Sign-in is a ghost button, sign-up is a primary button.
- **Dashboard nav:** A sidebar at `lg` and up; below `lg` it collapses into a
  `Sheet` triggered from the dashboard header.

### Signature Component: the cardless ProductCard

The storefront `ProductCard` is deliberately **not** a `Card`. It is a bare
stack: a square image in an Oat-filled `rounded-lg` frame, then the title,
artisan name, and price below, with `12px` between. No border, no ring, no
container chrome. The photo carries the card.

Two motions bring it to life: the image scales to 103% over 500ms on hover
(eased with a quart curve), and the title shifts from navy to Philippine
Vermilion. The wishlist heart is absolutely positioned in the top-right corner
as a sibling of the link, never nested inside it. The price renders through
`PriceTag` in vermilion at 14px, weight 500, with any compare-at value struck
through in Driftwood.

This is "editorial, not retail" expressed in one component: the work is framed
and given room, not boxed and ranked.

## 7. Do's and Don'ts

### Do:

- **Do** carry every click on Deep Sea Navy (#1A2B3A). Buttons and primary CTAs
  are navy, always.
- **Do** reserve Philippine Vermilion (#C8413C) for prices, links, and "Sale" /
  "Limited" badges. It is a highlight, never a fill.
- **Do** switch to Fraunces only for editorial moments: hero copy, section
  headlines, product titles on detail pages, artisan names. Geist everywhere
  else.
- **Do** keep surfaces flat. Separate them with the 1px `navy / 10%` ring or a
  Shoreline Sand border, never a drop shadow.
- **Do** let storefront product photos sit in bare containers. Use the cardless
  ProductCard pattern; photos are the heroes.
- **Do** bump primary CTAs to at least 44px height on mobile. The default 32px
  control height is below a comfortable touch target.
- **Do** cap body copy at 65 to 75 characters per line, and respect
  `prefers-reduced-motion` on every animation.

### Don't:

- **Don't** build the **big-box marketplace**: no cramped grids, no star-rating
  noise, no manufactured scarcity ("only 2 left!").
- **Don't** build the **Etsy-style craft feed**: no discount banners, no
  badge-heavy cards, no infinite homogenous grid where every card screams
  equally.
- **Don't** build the **loud DTC startup**: no gradient-soaked surfaces, no
  oversized type, no emoji, no popups, exit-intent modals, or countdown timers.
- **Don't** fill a button with vermilion or any red except Deep Ember on a true
  destructive action.
- **Don't** let Heirloom Gold appear beyond the occasional limited-drop moment.
  Ubiquity kills it.
- **Don't** reach for font weight 600 or 700. Hierarchy is size plus Fraunces,
  not heaviness.
- **Don't** use a colored side-stripe border, gradient text, or decorative
  glassmorphism. The dialog scrim's `backdrop-blur` is the only blur in the
  system.
- **Don't** wrap storefront products in shadowed cards or repeat identical
  icon-heading-text card grids.

**Anti-pattern test:** if a storefront screen could be mistaken for an Etsy
search-results page, the grid is too dense and the badges are too loud.
Editorial means whitespace, a clear focal point per card, and the photo doing
the work.
