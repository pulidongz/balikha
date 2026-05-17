# Product

## Register

brand

The public storefront is the face of Balikha, and its editorial design is part
of the product's value. Treat marketing surfaces (`app/(marketing)/*`: home,
shop, product detail, search) and auth pages as **brand**. Override to
**product** per task when working on the internal app surfaces: the seller
dashboard (`app/(dashboard)/*`), the buyer account area (`app/(account)/*`), and
admin (`app/(admin)/*`). There, design serves the workflow.

## Users

Three audiences share one product.

- **Buyers.** People browsing for handmade work, often unhurried, on a phone or
  a laptop. Their job: find a piece worth buying, then feel confident enough to
  buy it from a maker they have never met and an object they cannot touch
  first. They discover, follow artisans, wishlist, and order.
- **Artisan-sellers.** Independent Filipino makers running a small craft
  business: pottery, textiles, wood, silver, leather, glass, soap, paper,
  coffee. Their job: present their craft with dignity and handle the shop side
  of the work, listing products, organizing catalogs, and fulfilling orders. The
  dashboard is a working tool used between making sessions, not a place they
  linger.
- **Admins.** A small internal team handling moderation, order oversight, and
  search analytics. Their job: keep the marketplace trustworthy without getting
  in the way of the other two.

## Product Purpose

Balikha is a marketplace where independent Filipino artisans list and sell
handmade work, and where buyers discover it. It exists because handmade craft is
poorly served by big-box and feed-style marketplaces that flatten every maker
into an identical listing and compete on price and urgency.

It is an early-stage product genuinely heading toward launch, not a demo.
Success looks like this: an artisan opens their storefront and feels their work
is presented the way a gallery would present an artist, and a buyer trusts the
craft enough to purchase without hesitation. The marketplace earns money for
makers and earns trust for the buyers who back them.

## Brand Personality

Warm, human, grounded.

The voice is plain-spoken and unhurried, the way a maker talks about their own
work: specific, honest, never salesy. Copy names the hands behind the object and
tells the long-form story rather than listing features. The product is
approachable and never precious or aloof.

Emotional goals: a buyer should feel calm confidence, and an artisan should feel
honored, that the time and skill in their work is visible and respected.

## Anti-references

Balikha should never look or feel like any of these.

- **Big-box marketplaces (Amazon, eBay).** Cramped grids, star-rating noise, and
  manufactured scarcity ("only 2 left!"). Balikha does not pressure buyers.
- **Etsy-style craft feed.** Badge-heavy cards, discount banners, and an
  infinite homogenous grid where every listing screams equally. Balikha lets
  work breathe and frames it, rather than ranking it.
- **Loud DTC startup.** Gradient-soaked surfaces, oversized type, emoji, and
  growth-hack patterns (popups, exit-intent modals, countdowns). Balikha builds
  trust through clarity, not interruption.

A clean, restrained internal dashboard is welcome. The warmth requirement is
about human framing and plain language, not a ban on minimalism.

## Design Principles

1. **Treat each maker like a gallery treats an artist.** A storefront frames the
   work, it does not rank it. No leaderboards, no "bestseller" badges, no
   competition between makers on the same screen.
2. **Editorial, not retail.** Whitespace and typographic hierarchy do the
   selling. The product should feel browsed, not pushed.
3. **The hands stay visible.** Surface the human behind the work, the maker's
   name, location, and story, wherever the work appears. Craft without a
   visible maker is just inventory.
4. **Calm confidence over urgency.** Trust is earned with clarity, honest
   pricing, real photography, and stated response times. It is never
   manufactured with scarcity, countdowns, or pressure.
5. **Warmth is structural.** Approachability comes from plain language and human
   framing built into the page, not from playful flourishes bolted on at the
   end.

## Accessibility & Inclusion

Target: **WCAG 2.2 AA** on all public storefront and auth pages, treated as a
hard requirement. That covers color contrast, full keyboard navigation, visible
focus states, screen-reader labels, and descriptive alt text on every product
image (photography is the product, so missing alt text is a real failure).

Internal dashboards (seller and admin) are held to a pragmatic bar: keyboard
navigability and sufficient contrast are required, but exhaustive AA auditing is
not. Do not ship a keyboard trap or an unreadable control anywhere.

Respect `prefers-reduced-motion` globally; motion is always enhancement, never
load-bearing. Copy is written in plain Filipino-English: clear, idiom-light, and
readable for a broad audience.
