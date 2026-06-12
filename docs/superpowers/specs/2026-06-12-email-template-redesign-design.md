# Email Template Redesign — Design

**Date:** 2026-06-12
**Status:** Approved pending user review

## Problem

All 8 transactional templates share `lib/email/templates/_layout.tsx`, which is
already in the brand register (cream body, serif wordmark and headline with the
vermilion tick, oat info blocks, navy CTA). But the system stops short of the
brand: content floats directly on the cream background with no surface
hierarchy, the wordmark is plain text (Gmail strips webfonts, so most
recipients see Georgia, not Fraunces), the weekly digest is a bullet list, and
an art marketplace emails with no art — no photo of the piece an order or
message is about.

## Decisions

1. **Full redesign, one shared system** (chosen over per-template art
   direction and over re-skinning a prebuilt kit). All 8 templates upgrade by
   construction because they share the shell.
2. **Visual direction A: navy band + white card** (chosen over an editorial
   letterhead and an oat-canvas/media-row direction, from rendered mockups).
3. **Craft imagery with graceful fallback** — order and message emails show
   the piece's photo when the event has one; the layout degrades to imageless
   cleanly.
4. **PNG wordmark** generated once from real Fraunces (chosen over text with
   Georgia fallback) — the band is the redesign's signature moment.

## The shell (`lib/email/templates/_layout.tsx`)

`EmailLayout` keeps its contract (`preview`, `heading?`, `children`) and gains
`heroImageUrl?: string` and `heroImageAlt?: string`. Anatomy, top to bottom:

- **Cream body** `#FDFCF7`, 560px container (unchanged).
- **Navy band** `#1A2B3A`, rounded top corners (10px), ~16px × 24px padding,
  containing the PNG wordmark (`alt="Balikha"`, explicit height ~22px,
  retina-sized asset).
- **White card** `#FFFFFF`, 1px `#E6DFD1` border, rounded bottom corners, no
  top border (band + card read as one unit). When `heroImageUrl` is set, the
  photo renders full-width at the top of the card with `width: 100%; height:
auto` — never cropped, because `object-fit` is unsupported in Outlook.
  Card padding (~24px) holds the existing serif heading + vermilion tick,
  then the template's children.
- **Footer outside the card**, driftwood `#52616F` small text:
  "Balikha, an artisan marketplace · balikha.art · Email preferences", with
  preferences linking to `/account/notifications`. The digest's
  legally-required in-body unsubscribe link is unchanged.
- `EmailButton` (navy, 8px radius) and `FallbackUrl` (oat block) survive
  as-is; both already match the direction.
- New component `EmailStatRows` for the digest: each row is a large serif
  numeral (Fraunces stack with Georgia fallback) beside its label, hairline
  `#E6DFD1` rules between rows.

Email-client constraints carry over from the current layout: inline styles
only, hardcoded hex (clients strip `<style>`; tokens cannot be imported),
widely-supported CSS only. Dark mode gets no special handling — the navy band
with a cream PNG wordmark stays legible under Gmail's auto-invert, which is
part of the PNG choice's rationale.

## Wordmark asset

New one-time script `scripts/generate-email-wordmark.ts`:

- Fetches the Fraunces TTF (script-time download; the app's `next/font`
  pipeline is not reusable here, and the OG `ImageResponse` routes do not load
  Fraunces today).
- Renders "Balikha" in cream `#FDFCF7` on transparent at 2× via satori,
  writes `public/email/wordmark-cream.png`.
- The PNG is committed; the script stays in the repo for regeneration.
- Templates reference it by absolute URL (`NEXT_PUBLIC_APP_URL` +
  `/email/wordmark-cream.png`), consistent with the email layer's
  absolutization convention.

## Image plumbing

- `OrderEmailDispatch` and `MessageEmailDispatch`
  (`lib/email/notifications.ts`) gain optional `imagePath?: string` —
  RELATIVE, absolutized in the email layer exactly as `url` is today.
  Templates never receive relative URLs.
- Order dispatch call sites already operate on the order's product (they pass
  `productTitle`); the same lookup extends to the product's primary image
  path. Message dispatches pass `imagePath` only when the thread has product
  context.
- No image → imageless card. The hero is decorative, never load-bearing:
  image-blocking clients see `alt` text and an intact layout; plain-text
  rendering (`render(..., { plainText: true })`) is unaffected. Deleted
  upload files render as a broken image in old emails — same exposure the
  site already has; no new handling.

## Per-template treatment

- **order-notification** — hero photo when available (flagship).
- **new-message** — hero photo when the conversation is about a piece;
  quoted-preview oat block stays.
- **weekly-digest** — `EmailStatRows` replaces the bullet list. No images in
  v1: the counts aren't per-work, so there is no honest photo to attach.
- **verify-email, reset-password, seller-application, listing-takedown,
  system-test** — imageless shell; content otherwise unchanged.

## Verification

No component-test framework exists. Gates and checks:

- `npm run check` (tsc + eslint + prettier) green.
- Extend the preview tooling so **all 8 templates** render to `.dev-mail/`
  (today only 2 do) — with and without `imagePath` for the two image-bearing
  templates — reviewed visually before merge.
- One real send via `npm run email:test` to confirm the wordmark and hero
  URLs resolve outside the dev host.
- `sendEmail` itself is untouched apart from new optional template props;
  the HTML+plain-text dual-part posture (spam-score protection) is preserved.

## Out of scope

- In-app notification UI and the digest sender's queries.
- New email types.
- Dark-mode-specific CSS hacks.
- Any change to `lib/email/send.ts` beyond what new props require (expected:
  none).
