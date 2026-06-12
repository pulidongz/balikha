# Balikha — Community Pivot: Ticket Backlog

> Purpose of this file: a self-contained backlog Claude Code can consume one ticket at
> a time. Each ticket carries its own context — no chat history needed.

## How to use with Claude Code

1. Save this file in the repo (e.g. `docs/TICKETS.md`).
2. Work one ticket per session. Suggested prompt:
   `Read docs/TICKETS.md — global context plus ticket T1 only. Explore the codebase, propose a plan, wait for my approval, then implement.`
3. Respect the phase order; "Depends on" lines mark hard dependencies.
4. Optional: ask Claude Code to mirror these as GitHub issues via the `gh` CLI.

---

## Global context (read before any ticket)

**Product:** Balikha (balikha.art) — a platform for independent Filipino artisans.
Next.js app, currently structured as a marketplace: artists are "shops", works are
priced listings, breadcrumb is `Shop › {artist} › {work}`.

**Strategic direction:** Balikha is pivoting from marketplace-first to
**community-first**. The artist profile ("studio") is the atomic unit, not the
listing. Goals, in order:

1. Artists can showcase work (selling optional, not required).
2. Artists get visible traction feedback (follows, appreciations, comments, views).
3. An engagement loop exists: follow → feed → notification → return visit.
4. Each studio page doubles as the artist's best portfolio/link-in-bio page —
   this is the growth loop (artists share their own page).

**Brand constraints (apply to all UI work):**

- Editorial / gallery tone. "Frame it rather than rank it." No urgency mechanics,
  no countdown timers, no paid placement, no algorithmic-feeling density.
- Generous whitespace, work-forward imagery, plain storytelling.
- Market: Philippines. Currency ₱. Mobile-first (most traffic will be mobile).

**Engineering conventions for every ticket:**

- Explore the repo first; locate existing models/routes/components before writing.
- Prefer extending existing patterns over introducing new libraries.
- Every user-facing string change: check for SEO/OG/meta and sitemap impact.
- All new pages/states need a designed empty state (the platform is small today —
  1 artist, 1 work — and must not look broken or abandoned at low volume).
- Auth-gated actions must redirect back to the originating page after sign-in.

---

# Phase 0 — Identity: from marketplace to community

## T1 — Reframe artists as studios, not shops

**Priority:** P0 · **Effort:** S–M · **Depends on:** —

**Context.** Routes, breadcrumbs, and labels currently model the artist as a store:
`/shop/{slug}`, breadcrumb `Shop › GPul Pottery › Mug`, homepage label "1 shop".
Community direction requires the artist to read as a person/practice, not inventory.

**Task.**

- Rename route segment `/shop/` → `/studio/` with permanent (301) redirects from all
  old URLs.
- Breadcrumbs become `{Studio name} › {Work title}` (drop the "Shop" root).
- Replace user-facing "shop"/"seller" copy sitewide with "studio"/"artist"/"maker"
  (grep all strings; includes meta titles, OG tags, sitemap, footer).
- Keep DB table/internal names unchanged if renaming is risky — this ticket is about
  user-facing framing.

**Out of scope.** Visual redesign of the studio page (T2).

**Acceptance criteria.**

- [x] Old `/shop/...` URLs 301 to `/studio/...`.
- [x] No user-facing "shop" strings remain (verified by grep + manual pass).
- [x] Meta/OG/sitemap reflect new URLs and labels.

## T2 — Studio page v2: identity + personalization

**Priority:** P0 · **Effort:** L · **Depends on:** T1

**Context.** The current studio page is an initials avatar, name, city, a one-line
bio, and a priced list. For a community product the profile _is_ the product, and it
must be good enough that an artist puts the URL in their Instagram bio even with
zero followers on Balikha.

**Task.**

- Add artist-editable fields: profile photo, cover/banner image, multi-paragraph
  bio/story, craft tags (e.g. pottery, weaving), external links (Instagram, Facebook,
  TikTok, website), location, joined date.
- Page structure: hero (cover + photo + name + location + Follow) → story →
  works grid → updates section (placeholder until T9).
- Personalization controls in an owner-only edit mode: pin a featured work,
  reorder/toggle sections, choose cover crop. Keep options few and tasteful —
  curation, not MySpace.
- Empty fields must collapse gracefully (a new artist with only a name and three
  photos should still look intentional).

**Acceptance criteria.**

- [x] Owner can edit every field above from the page itself.
- [x] Page looks complete with exactly 1 work and minimal profile data.
- [x] OG/share image derives from cover or profile photo (full version in T18).
- [x] Mobile layout verified.

## T3 — Price-optional works (showcase mode)

**Priority:** P0 · **Effort:** M · **Depends on:** —

**Context.** Today the only unit of content is a priced SKU with stock and shipping
weight. Artists who want to showcase (WIP, experiments, sold pieces, commissions)
are filtered out at the door.

**Task.**

- Make price/stock optional on a work. Add a status: `for_sale` /
  `showcase` / `commission_inquiries`.
- Work detail page: hide all commerce UI for non-sale works; show "Ask the maker"
  as the primary action instead.
- Creation flow asks "Is this for sale?" _after_ photos and story, not first.

**Acceptance criteria.**

- [x] A work can be published with no price and renders correctly in grids and
      detail view.
- [x] For-sale works are unchanged.
- [x] Status is editable after publishing.

## T4 — Entry CTA and sign-up reframe

**Priority:** P0 · **Effort:** S · **Depends on:** —

**Context.** The only artist-facing CTA is "Sell your craft"
(`/sign-up?intent=seller`). That framing recruits sellers and repels
showcase-first artists — the opposite of the community goal.

**Task.**

- Primary artist CTA becomes "Share your work" (nav, footer, homepage). Selling is
  mentioned as optional ("…and sell it if you want to").
- Update sign-up page copy to match. Keep/extend the `intent` param for analytics.

**Acceptance criteria.**

- [x] All entry points updated; sign-up copy reflects showcase-first framing.

---

# Phase 1 — The engagement loop

## T5 — Make Follow real

**Priority:** P0 · **Effort:** M · **Depends on:** T1

**Context.** A Follow button exists on the studio page but has no visible effect:
no counts, no feed, no notifications. A follow with no payoff trains users that
interacting does nothing.

**Task.**

- Persist follows (user ↔ studio). Unfollow. A "Following" list for users.
- Show follower count on the studio page, but hide it below a threshold (< 5) to
  avoid advertising emptiness.
- Signed-out click on Follow → sign-in → redirected back with the follow applied.

**Acceptance criteria.**

- [x] Follow/unfollow persists across sessions; counts accurate.
- [x] Counts hidden below threshold.
- [x] Post-auth redirect completes the original follow.

## T6 — Home feed

**Priority:** P0 · **Effort:** L · **Depends on:** T5 (richer with T9)

**Context.** There is currently no reason to return: nothing changes between
visits. The loop is follow → feed → return.

**Task.**

- Signed-in homepage becomes a reverse-chronological feed of new works (and, after
  T9, updates) from followed studios.
- Card: image, work title, studio name + avatar, relative time.
- Fallback when following nothing: recent works across the platform (fine while
  the platform is small) plus a "studios to follow" strip.
- Pagination or infinite scroll; sensible query indexing.

**Acceptance criteria.**

- [x] New work from a followed studio appears in the feed.
- [x] Empty/fallback states designed (see global conventions).
- [x] Signed-out homepage keeps the editorial landing.

## T7 — Appreciations

**Priority:** P1 · **Effort:** S–M · **Depends on:** —

**Context.** Communities need a response unit that is nearly free to give. It is
also the artist's first traction signal.

**Task.**

- Appreciate/unappreciate a work (heart or similar, named to fit the brand voice).
- Count on the work detail page; subtle count on grid cards.
- Idempotent toggle per user; signed-out click follows the auth-redirect pattern.

**Acceptance criteria.**

- [x] Toggle works and persists; counts accurate under repeat clicks.
- [x] Events recorded in a way T10 (notifications) and T11 (stats) can consume.

## T8 — Comments

**Priority:** P1 · **Effort:** M · **Depends on:** —

**Context.** The only interaction today is buyer→seller ("Ask the maker"). Comments
create the artist↔buyer↔artist conversation surface the community needs.

**Task.**

- Comments on work detail pages (flat list is fine to start).
- Artist can delete comments on their own works; authors can delete their own.
- Basic abuse guards: rate limiting, length limits, a simple report action
  (report can just flag to an admin list for now).
- Inviting empty state ("Be the first to ask about the glaze…").

**Acceptance criteria.**

- [x] Post, render, delete work as specified.
- [x] Rate limit verified; report writes a record an admin can see.

## T9 — Studio updates (lightweight posts)

**Priority:** P1 · **Effort:** M · **Depends on:** T2 (section), T6 (distribution)

**Context.** A priced listing is expensive to produce, so studios go quiet between
drops. Updates (process shots, WIP, kiln-opening photos) are the cheap content unit
that keeps the feed alive.

**Task.**

- An update = 1–4 photos + short text. No price, no shipping fields.
- Posted from the studio page; renders in the studio's Updates section and in the
  home feed (T6).
- Edit/delete by owner. Appreciations on updates can reuse T7 if cheap, else defer.

**Acceptance criteria.**

- [x] An artist can publish an update in under a minute on mobile.
- [x] Updates appear on studio page and in followers' feeds.

## T10 — Notifications (in-app + email digest)

**Priority:** P1 · **Effort:** M–L · **Depends on:** T5, T7, T8

**Context.** Artists currently hear silence. Traction feedback is the retention
mechanism for the supply side.

**Task.**

- In-app notifications for: new follower, appreciation, comment, "Ask the maker"
  message.
- Weekly email digest per artist summarizing the same (skip send when zero
  activity — never email "you got nothing this week").
- Notification preferences + unsubscribe link that works.

**Acceptance criteria.**

- [x] Each event type generates exactly one notification.
- [x] Digest sends on schedule, suppressed when empty, honors preferences.

## T11 — Artist stats (traction dashboard)

**Priority:** P1 · **Effort:** M · **Depends on:** T7 (plus simple view tracking)

**Context.** "Provide traction for artists" requires showing it. Artists need a
private answer to "is anyone seeing my work?"

**Task.**

- Track studio-page and work-page views (simple counter or lightweight event table;
  no third-party analytics requirement).
- Owner-only dashboard: views, follows, appreciations, comments — totals and a
  last-30-days trend.

**Acceptance criteria.**

- [x] Numbers consistent with raw data; visible only to the studio owner.
- [x] Renders sensibly at near-zero volume (no sad empty charts — use plain
      numbers until there is enough data to chart).

---

# Phase 2 — Cold start and content quality

## T12 — Empty states and thin-count hiding

**Priority:** P1 · **Effort:** S · **Depends on:** —

**Context.** The homepage currently headlines "1 shop" and "1 piece" — advertising
emptiness. Early-stage platforms must manage the cold start, not display it.

**Task.**

- Hide any user-facing count below a threshold (suggest: 5) — sitewide rule.
- Rewrite low-volume states with purposeful copy: founder's note, "newly opened",
  invitation to join — matched to the editorial voice.
- Verify grids with 1–2 items look intentional, not broken.

**Acceptance criteria.**

- [x] No raw low counts appear anywhere user-facing.
- [x] Each empty/sparse state has copy + a CTA.

## T13 — Guided work upload (story, materials, photos)

**Priority:** P1 · **Effort:** M–L · **Depends on:** T3

**Context.** The flagship listing today is one photo and the description "pretty
mug" — while the About page promises gallery-grade framing ("the hands stay
visible, the story is told plainly"). Artists won't write stories unprompted; the
upload flow must draw it out. Current spec fields (dimensions, weight) are
shipping-calculator fields, not craft fields.

**Task.**

- Multi-photo upload, with suggested shot list in the UI: front, detail, scale /
  in-context. Soft minimum of 3 (nudge, don't block).
- Structured craft fields: materials, technique, dimensions, care instructions.
- Story field with prompt placeholder: "What is it? How did you make it? What makes
  it yours?"
- Soft quality nudges (e.g. "Works with a story get more appreciations") — never
  hard validation that blocks publishing.
- Migrate/update the existing seed listing ("Mug") to model the full standard —
  seed content sets community norms.

**Acceptance criteria.**

- [x] New flow captures photos + story + craft fields.
- [x] Existing works editable to add the new fields.
- [x] Detail page renders the new fields (full redesign lands in T16).

## T14 — Search v2: honest suggestions

**Priority:** P2 · **Effort:** S–M · **Depends on:** —

**Context.** The search page suggests trying "vase" or "leather" against a catalog
that cannot return results for either — teaching visitors the platform is empty in
two clicks.

**Task.**

- Generate suggestion chips from actual inventory (tags/categories with ≥ 1 result).
- Search across works _and_ studios/artist names.
- No-results state offers browse links and studios to follow instead of a dead end.

**Acceptance criteria.**

- [x] Every suggested query returns at least one result.
- [x] Studio names are findable.

## T15 — Editorial featuring (curated, never paid)

**Priority:** P1 · **Effort:** M · **Depends on:** T2 helpful

**Context.** Brand rule: "frame it rather than rank it." Featuring must be
founder-curated and free — it is simultaneously homepage content, the gallery
positioning, and the artist-recruitment pitch ("we'd love to feature you").
Paid placement is explicitly out of scope, indefinitely.

**Task.**

- Admin-settable featured slots: one homepage artist feature (image set + short
  editorial text + link to studio) and a featured-works row.
- At current scale, a simple admin page or a config/CMS file is acceptable — no
  heavy CMS build.
- Visual treatment: editorial (like a magazine feature), not a "sponsored" card.

**Acceptance criteria.**

- [x] Founder can change the featured artist/works without a code deploy (or with
      a trivial config edit — document whichever is chosen).
- [x] Homepage renders the editorial block; clearly curated in tone.

---

# Phase 3 — Work page and polish

## T16 — Work detail page redesign

**Priority:** P1 · **Effort:** L · **Depends on:** T3, T13

**Context.** Current page: single image, three spec rows, "Sign in to order", and
an "Ask the maker" element with unclear affordance. Craft sells on story, detail,
and the maker — the page must deliver the gallery treatment the brand promises.

**Task.**

- Image gallery: multiple photos, swipe on mobile, tap-to-zoom.
- Sections in order: gallery → title/price (if for sale) → story → materials &
  technique → maker block (avatar, name, location, Follow, link to studio) →
  care/shipping details in a quieter collapsed section.
- "Ask the maker" becomes an explicit button with a clear destination (message
  form; can be email-backed for now).
- Commerce UI only for `for_sale` works (T3); showcase works lead with story +
  Ask the maker.
- Appreciation + comments (T7/T8) integrated when available.

**Acceptance criteria.**

- [x] Renders both for-sale and showcase variants correctly.
- [x] All T13 fields displayed; mobile-first layout verified.
- [x] No layout shift on image load (set dimensions/aspect ratios).

## T17 — Header search affordance

**Priority:** P2 · **Effort:** S · **Depends on:** —

**Context.** The header currently renders what appears to be the literal text
"/search". If it is a keyboard-shortcut hint, it is unstyled; if it is the label,
it is broken copy.

**Task.**

- Replace with a proper search affordance: icon + "Search" (or an input on
  desktop). Optional: keep "/" as a keyboard shortcut, styled as a kbd hint.

**Acceptance criteria.**

- [x] Search affordance reads as search on desktop and mobile.

## T18 — Share cards and SEO for the link-in-bio loop

**Priority:** P1 · **Effort:** M · **Depends on:** T2

**Context.** The growth loop is artists sharing their studio URL from Instagram/
Facebook/TikTok bios. The page must index well and unfurl beautifully.

**Task.**

- Dynamic OG images for studios (cover/profile + name + Balikha mark) and works
  (work photo + title + studio).
- Per-page titles/descriptions from real content; sitemap covering studios and
  works; studio pages server-rendered/indexable.
- Verify unfurls on Facebook, Instagram DM, X, and Messenger (PH-relevant).

**Acceptance criteria.**

- [x] Link previews show rich, correct cards on the platforms above.
- [x] Sitemap includes all studios and works; pages indexable.

---

# Phase 4 — Buyer experience

## T19 — @pulidongz/psgc-data: self-updating PSGC package (separate repo)

**Priority:** P2 · **Effort:** M · **Depends on:** — (lives outside this repo)

**Context.** From the address-autocomplete brainstorm (2026-06-12). Balikha
needs normalized province/city/barangay data (PSGC — the PSA's official
geographic registry, published quarterly). Decision: own it as a public,
reusable npm package in its own repo rather than vendoring sync logic into
Balikha. Existing community packages are static snapshots dependent on
volunteer maintainers; the official PSA Classifications API requires a
token and is unfit as a runtime dependency. **Data-only by decision** — no
bundled React/UI component (couples a data package to React versions,
styling systems, and Google SDK churn; the reusable UI logic is a thin
combobox every app already has).

**Task.**

- New public repo `pulidongz/psgc-data`, npm package `@pulidongz/psgc-data`.
- Generated JSON per level (regions, provinces, cities+municipalities,
  barangays), flat records `{ code, name, level, parentCode }` (PSGC
  10-digit codes), exported `PSGC_VERSION` constant (e.g. 'Q3_2025').
- Typed helpers: hierarchy getters (`getProvinces(regionCode?)`,
  `getBarangays(cityCode)`, …) and normalized prefix/substring search
  (`searchCitiesMunicipalities(q, provinceCode?)`, …). Subpath exports per
  level so consumers don't bundle the ~4MB barangay file unintentionally.
- GitHub Actions monthly cron: query the PSA Classifications API
  (`classification.psa.gov.ph`, token as repo secret) for the latest
  quarterly version; on change, regenerate data, run integrity tests
  (hierarchy closure, minimum counts, code format), bump minor, publish to
  npm with provenance, cut a GitHub release with a data changelog. No
  change → green no-op. Failures notify via GitHub and retry next month.
- Versioning: minor = new PSGC quarter, patch = code fixes.

**Prerequisites (founder).** npm account + `NPM_TOKEN` repo secret; PSA API
token (requested via their Google Form); new GitHub repo.

**Acceptance criteria.**

- [ ] `npm install @pulidongz/psgc-data` ships typed data + helpers usable
      server-side in Balikha.
- [ ] A simulated new-quarter run publishes a new minor version without
      human input; a no-change run publishes nothing.
- [ ] Integrity tests gate publishing.

## T20 — Address autocomplete: Google street-first + PSGC fallback

**Priority:** P2 · **Effort:** M–L · **Depends on:** T19

**Context.** From the same brainstorm. The address form
(`components/account/address-form.tsx`) is all free text — inconsistent
city/province spellings will haunt shipping later, and multi-field entry
is tedious. Decision: hybrid. Google Places gives the lazy-friendly
street-first single field; the PSGC package is the barangay resolver and
the always-available fallback. Cost reality (2026 pricing): with session
tokens + debounce, ~8 autocomplete requests ($2.83/1k) + 1 Place Details
Essentials ($5/1k) ≈ 3¢ per completed address; free tier (10k requests +
10k details/month) covers ~1,200 address entries/month — effectively $0 at
current scale. Google's PH data is weak on barangay, hence the PSGC
resolution step.

**Task.**

- Smart street field via Google Places Autocomplete (New): session tokens
  (mandatory — abandoned sessions bill per-request), 300ms debounce,
  3-char minimum, `country:PH` restriction. Selection fills line1, city,
  province, postal code.
- Barangay: combobox fed by `@pulidongz/psgc-data`, scoped to the PSGC
  city matched (fuzzy) from Google's city/province strings; unmatched city
  → barangay stays free text.
- Degradation path: missing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, script-load
  failure, or quota exhaustion → form renders PSGC cascading autocomplete
  (province → city → barangay) with free-text street. Address entry must
  never hard-fail on Google availability.
- `user_addresses` schema unchanged — autocomplete is input assistance;
  rows keep storing plain text (PSGC renames never corrupt history).
- `.env.example` gains `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` only. The PSA
  token belongs to the package repo, never Balikha.

**Prerequisites (founder).** Google Maps Platform key with billing enabled,
referrer-restricted to balikha.art + dev hosts.

**Acceptance criteria.**

- [ ] Typing a street address autocompletes and fills the form; barangay
      list reflects the matched city.
- [ ] With the key removed, the PSGC cascading fallback renders and works
      end-to-end.
- [ ] Reused on both new-address and edit-address pages; existing
      addresses load/edit unchanged.

---

# Engineering health — follow-ups from the T1 code review (2026-06-10)

These are code-health tickets, not product tickets. They came out of the review
sweep done alongside T1 (studio rename). Each is independent of the phase order.

## E1 — Stop swallowing auth errors in server actions

**Priority:** P1 · **Effort:** M · **Depends on:** —

**Context.** ~15 server actions across `lib/actions/` (messaging.ts, product.ts,
orders.ts, sellers.ts, …) use the pattern
`await requireUser().catch(() => null)` then `if (!x) return err('Not authenticated')`.
`requireUser()`/`requireArtisan()`/`requireAdmin()` do a DB session lookup, so a
DB outage or any other infrastructure error is silently converted into a bogus
"not authenticated" response — no Sentry event, no log, indistinguishable from a
signed-out user. This violates the project's no-error-swallowing rule.

**Task.**

- Make the auth helpers throw typed errors (e.g. `UnauthorizedError`) if they
  don't already, and replace every `.catch(() => null)` with a typed catch:
  Unauthorized/Forbidden → clean `err(...)` result; anything else → rethrow.
- Consolidate into one shared helper (e.g. `tryRequireUser()`) so the pattern
  can't drift across actions.
- Touches authorization paths — review each call site carefully; no behavior
  change for genuinely signed-out users.

**Acceptance criteria.**

- [x] No `.catch(() => null)` remains on any `require*()` call (grep-verified).
- [x] A simulated DB failure during auth surfaces as a thrown/logged error, not
      as "Not authenticated".

## E2 — Route-level loading and error boundaries

**Priority:** P2 · **Effort:** M · **Depends on:** —

**Context.** No route segment in the app has a `loading.tsx` or `error.tsx`.
On slow mobile connections (the primary market) data-fetching pages render
nothing until the fetch resolves, and any fetch failure is an unhandled crash
with no recovery UI.

**Task.**

- Add `error.tsx` (friendly retry UI, brand voice) and `loading.tsx` (skeletons
  matched to each surface) to the data-fetching segments: `(account)`,
  `(dashboard)`, `(admin)`, and the public studio/work pages.
- Keep skeletons calm and editorial — no spinner farms.

**Acceptance criteria.**

- [x] Every segment that fetches data has both boundaries.
- [x] A thrown error in a page renders the error boundary with a working retry.

## E3 — Per-request memoization of profile/session lookups

**Priority:** P2 · **Effort:** S · **Depends on:** —

**Context.** Dashboard/account layouts fetch the current user/artisan profile,
and every child page fetches it again (`requireSellerProfile()`,
`getCurrentArtisanProfile()`, `getCurrentUser()`) — duplicate DB round-trips on
every render of every dashboard page.

**Task.**

- Wrap the auth-helper lookups in React `cache()` so repeated calls within one
  request share a single query. No API change for callers.

**Acceptance criteria.**

- [x] One DB session/profile query per request (verified via query logging in dev).
- [x] No behavior change otherwise.

## E4 — Extract inline admin query logic to lib/queries

**Priority:** P3 · **Effort:** M · **Depends on:** —

**Context.** Admin list pages (`products`, `users`, `sellers`, `orders`,
`audit-log`, `search`) each inline ~100 lines of filter parsing, WHERE-clause
assembly, count+list queries, and pagination math in the page component. The
pattern is copy-pasted per page and will drift.

**Task.**

- Extract per-surface query builders into `lib/queries/admin-*.ts` (filter →
  WHERE, list+total, pagination), reuse from the pages. Do this opportunistically
  when admin next gets touched (T15 is the natural moment).

**Acceptance criteria.**

- [x] Admin pages call shared query helpers; no inline WHERE assembly remains.
- [x] Behavior identical (same filters, same pagination).

## E5 — Preserve threadId through the guest order round trip

**Priority:** P2 · **Effort:** S · **Depends on:** —

**Context.** From the PR #94 review (guest order modal, 2026-06-12). ThreadView's
"Order this piece" CTA routes to the product page with `?threadId=<id>`, which
`OrderDialog` captures at mount and passes to `placeOrder` so the order links to
the conversation. If the viewer is signed out when they arrive (expired session,
shared link), the dialog now opens in guest mode, the strip effect removes
`threadId` from the URL, and `GuestAuthPanel` builds its auth links from bare
`productPath?order=1` — so after sign-in the order places **without** the thread
attachment, silently. (Not a regression: the old "Sign in to order" link dropped
it too; the guest dialog just makes the path more reachable.)

**Task.**

- In guest mode, fold the captured `threadId` into `GuestAuthPanel`'s `next`
  value: `${productPath}?order=1&threadId=${threadId}` when present.
  `safeNextOr` already permits `&` and `=`, and the dialog's auto-open init
  already reads both params.
- Verify the round trip end-to-end: signed-out + `?threadId=` → sign in → dialog
  reopens with the thread still attached → order links to the conversation.

**Acceptance criteria.**

- [ ] A signed-out user following a thread CTA and signing in places an order
      that links back to the thread.
- [ ] No change for signed-in thread→order flow or plain guest orders.

## E6 — Replace deprecated React.FormEvent usage

**Priority:** P3 · **Effort:** S · **Depends on:** —

**Context.** From the PR #94 review (2026-06-12). The IDE flags
`React.FormEvent` as deprecated in `components/marketplace/order-button.tsx`
(`handleSubmit(e: React.FormEvent)`). It doesn't fail `tsc` today, but
deprecated type aliases get removed in future `@types/react` majors and the
warning is noise in every editing session.

**Task.**

- Check the deprecation notice in the installed `@types/react` for the
  recommended replacement and apply it (likely the parameterized
  `React.FormEvent<HTMLFormElement>` or the event type React 19 docs suggest).
- Grep for other uses of the deprecated alias repo-wide and fix them in the
  same pass.

**Acceptance criteria.**

- [ ] No deprecated React event-type aliases remain (grep + IDE diagnostics
      clean on touched files).
- [ ] `npm run check` green; no behavior change.

## E7 — Search hardening: rate limit, pool config, suggestion caching

**Priority:** P2 · **Effort:** S–M · **Depends on:** —

**Context.** From the search scaling review (2026-06-12). Search itself is
well-built — Postgres FTS with GIN indexes, trigram fallback, keyset
pagination — and comfortably handles hundreds of concurrent users. The gaps
are operational, and none are search-design problems:

1. **No rate limiting** on `/search` (or any public read endpoint). Legit
   users are fine; a script hammering uncached search queries hits the DB
   unthrottled on a 1GB box.
2. **DB pool is unconfigured** — `postgres(env.DATABASE_URL)` uses
   postgres-js defaults (`db/index.ts`). Local dev already saturates
   `max_connections` when multiple dev servers run; prod should pin an
   explicit, deliberate pool size.
3. **`getSearchSuggestions()` is uncached** — the empty-state chips run a
   `unnest(materials)` aggregation on every render; facets already use
   `unstable_cache` with a 5-min TTL + tag, suggestions should match.
4. (Observation only) every search writes a `search_events` analytics row;
   fine now, revisit if search volume ever matters.

**Task.**

- Add a lightweight per-IP rate limit for search requests (in-memory or
  Postgres-backed; no new infra — single-instance deployment makes
  in-memory acceptable; document the limitation).
- Configure the postgres-js pool explicitly (`max`, `idle_timeout`,
  `connect_timeout`) sized for the 1GB Linode; document the numbers.
- Wrap `getSearchSuggestions()` in `unstable_cache` with the same
  `search-facets` tag + TTL pattern used by `getAvailableMaterials()`.

**Acceptance criteria.**

- [ ] Burst-requesting `/search` gets throttled responses; normal use is
      unaffected.
- [ ] Pool settings are explicit in `db/index.ts` with a sizing comment.
- [ ] Suggestion chips no longer query on every empty-state render
      (verified via query logging in dev).

---

# Backlog — explicitly NOT now (do not implement)

These are recorded so future sessions don't reinvent the rationale.

- **Payments (PayMongo or Xendit; GCash/Maya/cards).** Add at the _first sign of
  real purchase intent_, not before — but not long after either: off-platform
  settlement (GCash via DM) trains permanent leakage, and introducing a take-rate
  later feels like a takeaway. Use a licensed aggregator with split payouts;
  do not hold sellers' funds directly (regulatory exposure — verify current BSP
  rules at build time). Until then, keep the _order/inquiry flow_ on-platform even
  if money settles outside it.
- **Reviews / purchase-verified trust signals.** After first transactions.
- **Collections / saves (buyer-side curation).** After T6–T8 prove engagement.
- **Direct messaging beyond "Ask the maker".** After comment volume justifies it.
- **Events / open calls / challenges.** Strong fit for the PH craft scene; needs a
  minimum artist base first.
- **Paid placement / paid "featured".** Conflicts with the brand promise
  ("frame, not rank"). Default answer is never; revenue should come from
  transaction fees and, later, optional artist subscription tools.
