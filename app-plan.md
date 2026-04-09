# Balikha — artisan marketplace app plan

## Project overview

A marketplace where artisan sellers (starting with pottery) can post catalog items and buyers can purchase them. The first seller is the developer/owner, used to dogfood and validate the platform before opening to others.

> **⚠️ Next.js 16, NOT 15.** All Next.js code in this plan MUST be verified against `frontend/node_modules/next/dist/docs/` before implementation. The installed version (16.x) has breaking changes from the Next.js most LLMs were trained on — APIs, conventions, file structure, and especially the caching/dynamic-rendering model differ. Read `frontend/AGENTS.md` and the relevant section of `next/dist/docs/01-app/` before writing any frontend code.

---

## Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Backend API | Hono (TypeScript, `@hono/node-server`) | Lightweight, Web Standards-based, first-class TypeScript |
| Frontend | Next.js 16 (App Router) | SSR/SSG for ecommerce SEO, proxies `/api/*` to Hono via `rewrites` |
| Database | PostgreSQL 16 (Debian image) | Full control, ICU locale support for Filipino text |
| ORM + migrations | Drizzle ORM | Lightweight, TypeScript-native, SQL-close |
| Auth | Better Auth (Hono adapter) | Email/password + Google OAuth + RBAC admin plugin. Runs on Hono backend. |
| File storage (local) | MinIO (Docker) | S3-compatible, free, runs alongside app |
| File storage (prod) | MinIO on Linode (same container) | No extra vendor, S3-compatible |
| Payments | PayMongo | GCash, Maya, cards — PH-first |
| Containerization | Docker + Docker Compose | Local dev mirrors production exactly |
| Hosting | Linode VPS (self-hosted, 8GB recommended) | Already owned, full control, no vendor lock-in |
| Reverse proxy | Traefik v3 | Docker-native routing via labels, built-in Let's Encrypt ACME |
| SSL | Let's Encrypt (via Traefik ACME) | Free, auto-renews, no Certbot needed |
| CI/CD | GitHub Actions + ghcr.io | Build images in CI, push to registry, pull on VPS |
| Testing (backend) | Vitest | Native ESM, fast, Hono routes testable via `app.request()` |
| Testing (frontend) | Vitest + React Testing Library | Same runner as backend, RTL for React component tests |
| Testing (e2e) | Playwright | Real browser, runs against the Docker stack |
| Node version | 22.14.0 | LTS, native `--env-file` support |

**Architecture:** Backend (Hono) and frontend (Next.js) are separate services. The browser only talks to Next.js. Next.js `rewrites` proxy `/api/*` to Hono in all environments. The backend is never exposed to the internet directly.

**Two kinds of fetch — must not be confused:**
1. **Browser → Next.js (relative path):** `fetch('/api/...')` from a client component goes through `next.config.ts` rewrites → backend. Cookies forward automatically (same-origin).
2. **Next.js server component → backend (absolute URL):** Server components have no `window.location`, so they need a full URL (`http://backend:8787` internally). Cookies do NOT forward automatically — server-side fetches must explicitly read `cookies()` from `next/headers` and re-attach them.

**Server-side API client (mandatory):** Every server component that calls the backend MUST use a typed client at `frontend/src/lib/api/server.ts` that reads cookies via `next/headers` and forwards them on every fetch. Bare `fetch()` calls from server components are forbidden — they will silently lose authentication and cause redirect loops.

**Rendering contract:** All pages that fetch backend data MUST be `export const dynamic = 'force-dynamic'` (or `revalidate = 0`). No data-fetching pages are statically prerendered. CI runs `docker build frontend` as a standalone job with no backend running — if the dynamic contract is broken, the build fails fast.

**Cookie settings (Better Auth defaults to verify):** `SameSite=Lax`, `Secure=true` in staging/preprod, `HttpOnly=true`, `Path=/`, `Domain` unset. The cookie is set by Hono/Better Auth and passes through Next.js rewrites unchanged. Do NOT use the `__Secure-` cookie prefix in dev (HTTP localhost) — only in HTTPS environments.

**Auth note:** Better Auth runs on the Hono backend with first-class adapter. Cookies are same-origin since the browser only talks to Next.js. Auth.js (NextAuth) is NOT used — it's designed for monolithic Next.js and poorly suited for a split-service architecture.

---

## Docker Compose setup

Multiple compose files — local dev, plus per-environment on VPS. No `version` key (Docker Compose v2).

### docker-compose.yml (local dev)

See `app/docker-compose.yml` for the live config. Services:

| Service | Image/Build | Port | Health Check |
|---------|------------|------|-------------|
| `db` | `postgres:16` (Debian) | 5432 | `pg_isready` |
| `minio` | `minio/minio` | 9000, 9001 | `curl` health endpoint |
| `minio-init` | `minio/mc` | — | One-shot: creates `balikha` bucket |
| `backend` | `./backend` (Hono) | 8787 | — |
| `frontend` | `./frontend` (Next.js) | 3000 | — |

Dev mode uses volume mounts for hot-reload on both backend (`tsx watch`) and frontend (`next dev`).

### Staging/preprod (Linode VPS)

Three compose files on the VPS:
- `docker-compose.proxy.yml` — Traefik reverse proxy (always running, ports 80 + 443)
- `docker-compose.staging.yml` — staging environment (staging.balikha.ph)
- `docker-compose.preprod.yml` — pre-production environment (preprod.balikha.ph)

Each environment gets its own db, minio, backend, and frontend containers with prefixed names (e.g. `staging-db`, `staging-backend`). Traefik routes all traffic to Next.js; Next.js `rewrites` proxy `/api/*` to Hono internally. Images are pulled from ghcr.io (built in GitHub Actions CI), not built on the VPS.

---

## Database schema (Drizzle ORM)

### Better Auth owns the user table

The placeholder `users` table in `backend/src/db/schema.ts` is **deleted**. Better Auth's CLI generates the canonical auth schema (`user`, `session`, `account`, `verification`) and we extend the `user` table with app-specific fields via `additionalFields` in the Better Auth config.

**Generation step (run once before any auth code is written):**
```bash
cd backend
npx @better-auth/cli@latest generate --output src/db/schema.ts
```

This produces four tables with Better Auth's required columns. The `user` table uses **`text` (nanoid) primary keys** by default — accept this; do not try to force UUIDs. All FK references in the app's own tables (`shops`, `orders`, `order_items`) point at `user.id` (singular table name).

**App-specific fields are added via `additionalFields`** in `backend/src/auth/index.ts`:
```ts
import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { admin } from 'better-auth/plugins'
import { db } from '../db/index.js'

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  socialProviders: {
    google: {
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    },
  },
  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'buyer',
        input: false, // users cannot self-set role on signup
      },
      avatarUrl: { type: 'string', required: false },
    },
  },
  plugins: [admin()],
})
```

After editing `additionalFields`, re-run `npx @better-auth/cli generate` to update the schema, then `npm run db:generate` to produce a Drizzle migration.

### shops
```ts
export const shops = pgTable('shops', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').references(() => user.id).notNull(), // FK to Better Auth user (text/nanoid)
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  bio: text('bio'),
  bannerUrl: text('banner_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  userIdx: index('shops_user_idx').on(t.userId),
}))
```

**Slug rules (enforced server-side, not just unique constraint):**
- Format: `^[a-z0-9-]{3,40}$` (lowercase, digits, hyphens; 3–40 chars)
- Reserved words list (rejected): `admin`, `api`, `auth`, `cart`, `checkout`, `dashboard`, `login`, `logout`, `orders`, `register`, `seller`, `shop`, `shops`, `signin`, `signout`, `signup`, `storage`, `user`, `users`, `webhooks`
- Case sensitivity: stored lowercase, lookups are exact (case-sensitive)

### items
```ts
export const items = pgTable('items', {
  id: uuid('id').defaultRandom().primaryKey(),
  shopId: uuid('shop_id').references(() => shops.id).notNull(),
  name: text('name').notNull(),
  description: text('description'),
  price: integer('price').notNull(), // in PHP centavos (e.g. 95000 = ₱950.00)
  stock: integer('stock').default(1).notNull(),
  photos: text('photos').array(), // array of S3 KEYS (e.g. 'items/abc-123.jpg'), NOT URLs
  tags: text('tags').array(),
  category: text('category'), // e.g. 'mug', 'bowl', 'set', 'display'
  available: boolean('available').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  shopIdx: index('items_shop_idx').on(t.shopId),
  categoryAvailableIdx: index('items_category_available_idx').on(t.category, t.available),
}))
```

> **Important:** `photos` stores S3 keys only (e.g. `items/abc-123.jpg`), never URLs. The public URL is built at read time by a single helper that knows the environment's `STORAGE_PUBLIC_BASE_URL`. This decouples stored data from domain/storage layout changes.

### orders
```ts
export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  buyerId: text('buyer_id').references(() => user.id).notNull(), // FK to Better Auth user (text/nanoid)
  shopId: uuid('shop_id').references(() => shops.id).notNull(), // single shop per order — see "Single-shop cart" below
  status: text('status', {
    enum: ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']
  }).default('pending').notNull(),
  currency: text('currency').default('PHP').notNull(), // ISO 4217; forward-compat for multi-currency
  subtotalAmount: integer('subtotal_amount').notNull(), // sum of item priceAtPurchase * qty, in centavos
  shippingAmount: integer('shipping_amount').default(0).notNull(), // in centavos; 0 = free or seller-arranged
  taxAmount: integer('tax_amount').default(0).notNull(), // VAT or other tax, in centavos
  totalAmount: integer('total_amount').notNull(), // subtotal + shipping + tax, in centavos
  shippingAddress: jsonb('shipping_address').notNull(),
  courierName: text('courier_name'),
  trackingUrl: text('tracking_url'),
  paymongoPaymentId: text('paymongo_payment_id').unique(), // unique = idempotency guard for webhook replays
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (t) => ({
  buyerIdx: index('orders_buyer_idx').on(t.buyerId),
  shopIdx: index('orders_shop_idx').on(t.shopId),
  statusIdx: index('orders_status_idx').on(t.status),
}))
```

> **Tax/VAT note:** MVP defaults `taxAmount` and `shippingAmount` to 0 (free shipping, no VAT). The first seller is the developer/owner and is not VAT-registered. The schema is forward-compatible: when revenue approaches the PHP 3M VAT threshold, BIR-compliant Official Receipt (OR) generation can be added without a migration.

### order_items
```ts
export const orderItems = pgTable('order_items', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id).notNull(),
  itemId: uuid('item_id').references(() => items.id).notNull(),
  quantity: integer('quantity').default(1).notNull(),
  priceAtPurchase: integer('price_at_purchase').notNull(), // snapshot of items.price at order creation (centavos)
}, (t) => ({
  orderIdx: index('order_items_order_idx').on(t.orderId),
}))
```

### Single-shop cart constraint (MVP limitation)

`orders.shopId` is a single FK — one order = one shop. The MVP cart enforces this on the client AND server:
- **Client (Step 4):** Adding an item from a different shop than the cart's current items shows a confirmation modal: *"Your cart has items from ShopA. Adding this item will replace your cart contents. Continue?"*
- **Server (Step 5):** Checkout asserts all cart items share the same `shopId`. Mismatch → 400 with a clear error message.

Multi-shop carts with split orders are listed under **Future features** and intentionally deferred post-MVP. Documented in **Known MVP limitations** below.

---

## Auth setup (Better Auth on Hono)

Auth lives entirely in the Hono backend using Better Auth with the first-class Hono adapter.

**Why not Auth.js?** Auth.js uses encrypted JWTs (JWE) that can't be verified by a separate backend without sharing secrets and using Auth.js internals. Its Credentials provider is discouraged by maintainers with no built-in password hashing, email verification, or password reset. Better Auth is framework-agnostic, has a first-class Hono plugin, and supports email/password, 40+ OAuth providers, and RBAC out of the box.

### Features
- **Email/password** — built-in with password hashing, email verification, password reset
- **Google OAuth** — config-only setup (added after email/password works)
- **RBAC** — Admin plugin with `createAccessControl` for buyer/seller/admin roles
- **Drizzle adapter** — official PostgreSQL adapter with CLI schema generation
- **Sessions** — cookie-based, same-origin (browser only talks to Next.js, which proxies to Hono)

### Setup location
```
backend/src/
├── auth/
│   ├── index.ts          # Better Auth instance + Hono adapter
│   └── permissions.ts    # Role definitions (buyer, seller, admin)
```

### Role-based route protection
Protected routes are enforced via Hono middleware on the backend (not Next.js middleware):
```ts
// backend/src/middleware/requireRole.ts
// Checks session cookie → validates role → 403 if unauthorized
```

Next.js handles UI-level redirects (e.g., redirect to /login if not authenticated) but the backend is the source of truth for authorization.

### Better Auth route surface — verify rewrite-only architecture

Before starting implementation, map every Better Auth route and confirm each one flows through the Next.js rewrites proxy without needing a Next.js-side `app/api/` handler:

| Route | Direction | Notes |
|---|---|---|
| `POST /api/auth/sign-up/email` | Browser → Next.js → Hono | Standard rewrite |
| `POST /api/auth/sign-in/email` | Browser → Next.js → Hono | Standard rewrite |
| `POST /api/auth/sign-out` | Browser → Next.js → Hono | Standard rewrite |
| `GET /api/auth/session` | Browser → Next.js → Hono | Used by client-side hooks |
| `GET /api/auth/sign-in/social/google` | Browser → Next.js → Hono → 302 to Google | Verify Location header survives the rewrite |
| `GET /api/auth/callback/google` | Google → browser → Next.js → Hono | OAuth redirect URI registered with Google must be `https://staging.balikha.ph/api/auth/callback/google` |
| Password reset email link | Email → browser → Next.js → Hono | Reset token in query param; backend handles verification |
| Email verification link | Email → browser → Next.js → Hono | Same pattern as reset |

**Test before completing Step 1:**
1. End-to-end Google OAuth: register → click "Sign in with Google" → consent screen → land back signed in
2. Verify all Set-Cookie headers from Hono make it through the rewrite to the browser
3. Verify SSR session check (server component reads `cookies()`, calls `/api/auth/session` via the server-side API client) returns the correct user

If ANY Better Auth flow needs a Next.js `app/api/` handler, stop and discuss before adding one — that breaks the "no app/api" architecture invariant.

---

## PayMongo integration

```ts
// lib/paymongo.ts
const PAYMONGO_SECRET = process.env.PAYMONGO_SECRET_KEY

export async function createPaymentLink(order: {
  id: string
  amount: number  // in centavos
  description: string
}) {
  const res = await fetch('https://api.paymongo.com/v1/links', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(PAYMONGO_SECRET + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        attributes: {
          amount: order.amount,
          description: order.description,
          remarks: order.id,
        },
      },
    }),
  })
  return res.json()
}
```

### Webhook handler — MUST verify signature, idempotent, amount-checked

**The webhook is the most security-sensitive endpoint in the system.** An unverified webhook = trivial financial fraud (attacker forges `payment.paid`, marks orders paid without paying). Every requirement below is mandatory before this code ships:

```ts
// backend/src/routes/webhooks/paymongo.ts (Hono route)
import crypto from 'node:crypto'

const MAX_SKEW_SECONDS = 300 // reject events older than 5 minutes (replay protection)

app.post('/api/webhooks/paymongo', async (c) => {
  // 1. Capture RAW body BEFORE JSON parsing — signature is computed over raw bytes
  const rawBody = await c.req.raw.clone().text()
  const sigHeader = c.req.header('Paymongo-Signature')
  if (!sigHeader) return c.json({ error: 'missing signature' }, 401)

  // 2. Parse signature header: "t=<unix>,te=<hash>,li=<hash>" (test/live)
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => p.split('=') as [string, string])
  )
  const timestamp = parts.t
  const expectedHash = process.env.NODE_ENV === 'production' ? parts.li : parts.te
  if (!timestamp || !expectedHash) return c.json({ error: 'malformed signature' }, 401)

  // 3. Reject stale events (replay protection)
  const eventAge = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (eventAge > MAX_SKEW_SECONDS) return c.json({ error: 'stale event' }, 401)

  // 4. Recompute HMAC-SHA256 over `${timestamp}.${rawBody}` and compare
  const signed = `${timestamp}.${rawBody}`
  const computed = crypto
    .createHmac('sha256', process.env.PAYMONGO_WEBHOOK_SECRET!)
    .update(signed)
    .digest('hex')
  const valid = crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expectedHash))
  if (!valid) return c.json({ error: 'invalid signature' }, 401)

  // 5. NOW it's safe to parse and act on the event
  const body = JSON.parse(rawBody)
  const event = body.data.attributes
  if (event.type !== 'payment.paid') return c.json({ received: true })

  const orderId = event.data.attributes.remarks
  const paymentId = event.data.id
  const eventAmount = event.data.attributes.amount as number // centavos

  // 6. Idempotency: paymongoPaymentId is UNIQUE — duplicate webhook = no-op
  const order = await db.query.orders.findFirst({ where: eq(orders.id, orderId) })
  if (!order) return c.json({ error: 'order not found' }, 404)
  if (order.paymongoPaymentId === paymentId) return c.json({ received: true, idempotent: true })

  // 7. Amount check — defense against order tampering
  if (eventAmount !== order.totalAmount) {
    // Log to error monitoring; do NOT mark paid
    throw new Error(`amount mismatch: order=${order.totalAmount} event=${eventAmount}`)
  }

  // 8. Mark paid (will fail with unique violation if a concurrent request beat us — that's fine)
  await db
    .update(orders)
    .set({ status: 'paid', paymongoPaymentId: paymentId, updatedAt: new Date() })
    .where(eq(orders.id, orderId))

  return c.json({ received: true })
})
```

**Tests required (Vitest):**
- Forged signature → 401
- Stale timestamp (> 5min old) → 401
- Missing signature header → 401
- Valid signature, unknown order → 404
- Valid signature, amount mismatch → 500/throws (does NOT mark paid)
- Valid signature, valid amount → marks paid + returns 200
- Replay (same valid signature, second call) → 200 with `idempotent: true`, no DB change

> **Note:** All API routes (including webhooks) live in the Hono backend. Next.js has no `app/api/` directory.

---

## Project structure

The repo root is `app/` (the working directory). Inside it:

```
app/
├── backend/                          # Hono API (all business logic + API routes)
│   ├── src/
│   │   ├── index.ts                  # Hono app entry point, CORS, route mounting
│   │   ├── db/
│   │   │   ├── index.ts              # Drizzle client (pg Pool)
│   │   │   └── schema.ts            # All table definitions
│   │   ├── routes/
│   │   │   ├── health.ts            # GET /api/health
│   │   │   ├── items.ts             # CRUD /api/items
│   │   │   ├── shops.ts             # CRUD /api/shops
│   │   │   ├── orders.ts            # /api/orders
│   │   │   ├── upload.ts            # POST /api/upload (MinIO)
│   │   │   └── webhooks/
│   │   │       └── paymongo.ts      # POST /api/webhooks/paymongo
│   │   ├── auth/
│   │   │   ├── index.ts             # Better Auth instance + Hono adapter
│   │   │   └── permissions.ts       # RBAC role definitions
│   │   ├── middleware/
│   │   │   └── requireRole.ts       # Auth + role check middleware
│   │   └── lib/
│   │       ├── paymongo.ts           # PayMongo API client
│   │       └── minio.ts             # MinIO client
│   ├── drizzle/                      # Generated migration files
│   ├── drizzle.config.ts
│   ├── entrypoint.sh                # Auto-migrate on startup
│   ├── Dockerfile
│   ├── tsconfig.json
│   └── package.json
│
├── frontend/                         # Next.js (pages + UI only, no API routes)
│   ├── src/
│   │   └── app/
│   │       ├── (public)/
│   │       │   ├── page.tsx          # Home / catalog browse
│   │       │   ├── shop/[slug]/page.tsx
│   │       │   └── item/[id]/page.tsx
│   │       ├── (buyer)/
│   │       │   ├── cart/page.tsx
│   │       │   ├── checkout/page.tsx
│   │       │   └── orders/page.tsx
│   │       ├── (seller)/
│   │       │   ├── dashboard/page.tsx
│   │       │   ├── items/page.tsx
│   │       │   ├── items/new/page.tsx
│   │       │   └── orders/page.tsx
│   │       ├── (admin)/
│   │       │   └── dashboard/page.tsx
│   │       └── components/
│   │           ├── catalog/
│   │           ├── cart/
│   │           └── ui/
│   ├── next.config.ts                # standalone + rewrites (/api/* → Hono)
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml                # Local dev (db, minio, backend, frontend)
├── docker-compose.proxy.yml          # Traefik (VPS only)
├── docker-compose.staging.yml        # Staging env (VPS)
├── docker-compose.preprod.yml        # Preprod env (VPS)
├── .env.development                  # Committed, safe local defaults
├── .env.example                      # Template with CHANGE_ME placeholders
├── .gitignore
└── .github/workflows/
    ├── deploy-staging.yml
    └── deploy-preprod.yml
```

> **Key difference from original plan:** Backend and frontend are separate services. All API routes live in `backend/`. Next.js has NO `app/api/` directory — it uses `rewrites` in `next.config.ts` to proxy `/api/*` to Hono. **This invariant must be verified end-to-end during Step 1** (see "Better Auth route surface" section). If any Better Auth flow needs a Next.js-side handler, stop and discuss before adding one.

---

## Testing strategy

Three layers of tests, each with its own runner. All tests must pass in CI before deploy.

### Backend — Vitest (`backend/`)

Hono is Web Standards-based, so routes are testable without a real HTTP server via `app.request()`. The Hono app instance is created by `createApp()` in `backend/src/app.ts`, which keeps server startup (`serve()`) separate from app construction so tests don't need a port.

```ts
// backend/src/routes/health.test.ts
import { createApp } from "../app.js";

const app = createApp();
const res = await app.request("/api/health/ready");
expect(res.status).toBe(200);
```

**Health endpoint contract — must NOT swallow errors:**

The existing `backend/src/routes/health.ts` currently returns `200 {status: "ok", db: "disconnected"}` when the DB is unreachable. **This is a CLAUDE.md violation (error swallowing) AND a deployment hazard** — Traefik will route traffic to a broken backend because the health check passes. Fix before deployment phase:

- **`GET /api/health/live`** — process liveness only. Returns 200 if the Node process is up. Used by Docker `healthcheck` for restart-on-crash.
- **`GET /api/health/ready`** — readiness. Pings the DB. Returns **HTTP 503** if the DB query fails. Used by Traefik load balancer health check.
- The failing-DB Vitest test must assert non-200 (`expect(res.status).toBe(503)`), not the current "still 200" behavior.
- Update `docker-compose.*.yml` healthchecks and Traefik labels to use `/api/health/ready`.

**Test database strategy:**
- **Unit / route tests:** Mock the `db` and `pool` modules with `vi.mock()` — no real database needed
- **Integration tests** (later, when business logic gets complex): Spin up a real Postgres container with `@testcontainers/postgresql`, run migrations, tear down at end

**Scripts:**
- `npm test` — run once
- `npm run test:watch` — watch mode
- `npm run test:coverage` — with coverage report

### Frontend — Vitest + React Testing Library (`frontend/`)

```ts
// frontend/src/app/components/HealthCheck.test.tsx
import { render, screen, waitFor } from "@testing-library/react";
import HealthCheck from "./HealthCheck";

vi.spyOn(global, "fetch").mockResolvedValueOnce(
  new Response(JSON.stringify({ status: "ok", db: "connected", timestamp: "..." })),
);
render(<HealthCheck />);
await waitFor(() => expect(screen.getByText("connected")).toBeInTheDocument());
```

Setup uses jsdom environment + `@testing-library/jest-dom` matchers via `vitest.setup.ts`. `cleanup()` runs after each test to unmount components.

**Scripts:** Same as backend (`test`, `test:watch`, `test:coverage`).

### End-to-end — Playwright (root `app/`)

Tests the full stack against the running Docker Compose. Real browser, real backend, real database.

```ts
// e2e/landing.spec.ts
test("landing page shows healthy backend", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Balikha" })).toBeVisible();
  await expect(page.getByText("connected")).toBeVisible();
});
```

**Configuration:** `playwright.config.ts` at repo root, `baseURL` defaults to `http://localhost:3000` (overridable via `E2E_BASE_URL` env var so the same suite can run against staging).

**Prerequisite:** `docker compose up` must be running before `npm run test:e2e`.

**Scripts:**
- `npm run test:e2e` — headless run
- `npm run test:e2e:ui` — interactive UI mode
- `npm run test:e2e:headed` — headed (visible browser)

### Test layout

```
backend/
├── src/
│   ├── app.ts                      # createApp() factory (testable)
│   ├── index.ts                    # serve() entry point
│   └── routes/
│       ├── health.ts
│       └── health.test.ts          # colocated unit tests
├── vitest.config.ts
└── package.json

frontend/
├── src/app/
│   └── components/
│       ├── HealthCheck.tsx
│       └── HealthCheck.test.tsx    # colocated component tests
├── vitest.config.ts
├── vitest.setup.ts                 # RTL + jest-dom setup
└── package.json

app/                                # repo root
├── playwright.config.ts
├── e2e/
│   └── landing.spec.ts             # full-stack browser tests
└── package.json                    # root package.json for Playwright
```

### CI integration — see "CI/CD pipeline" section below for full job structure

---

## MVP build order

Build in this exact sequence — each step is usable before moving to the next.

### Step 0.5 — Migration baseline (BLOCKS Step 1)
- [ ] **Decide and document** drizzle migration strategy (option A: keep `drizzle-kit` as a prod dep so `entrypoint.sh` runs `drizzle-kit migrate`; option B: build a standalone migrator with `drizzle-orm/migrator` and drop drizzle-kit from runtime). Default: option A for MVP simplicity.
- [ ] Address multi-container migration race: gate migrations on a single init container (or, for MVP, accept that staging/preprod each run a single backend container so `set -e + drizzle-kit migrate` is safe — document the constraint)
- [ ] Verify `backend/Dockerfile` runtime stage has `drizzle-kit` available (currently `npm ci` without `--omit=dev` in the builder stage — confirm this carries through to runtime)

### Step 1 — Auth
- [ ] **First sub-step (BLOCKS everything else):** Run `npx @better-auth/cli generate --output backend/src/db/schema.ts` to produce `user`, `session`, `account`, `verification` tables. Delete the old placeholder `users` table from `schema.ts`.
- [ ] Configure `backend/src/auth/index.ts` with `additionalFields` (`role`, `avatarUrl`) and `admin()` plugin. Re-run the CLI generate so the additional fields land in the schema.
- [ ] Run `npm run db:generate` to produce the initial Drizzle migration. Verify `backend/drizzle/` contains the SQL file + `meta/_journal.json`. Commit them.
- [ ] Add `shops`, `items`, `orders`, `order_items` to `schema.ts` with FKs pointing at Better Auth's `user.id`. Re-run `db:generate` for a second migration.
- [ ] Set up Better Auth on Hono backend with Drizzle adapter (mount the auth handler at `/api/auth/*` using the Hono adapter)
- [ ] Email/password registration + login
- [ ] RBAC middleware on Hono (`backend/src/middleware/requireRole.ts`) protecting seller and admin API routes
- [ ] **Server-side API client** (`frontend/src/lib/api/server.ts`): typed fetch client that reads `cookies()` via `next/headers` and forwards them on every backend call. ALL server components MUST use this client; bare `fetch()` in server components is forbidden.
- [ ] Mark all data-fetching pages as `export const dynamic = 'force-dynamic'`. Add a CI job that runs `docker build frontend` with no backend running — must succeed.
- [ ] Next.js UI-level redirects for unauthenticated users (use the server-side API client to call `/api/auth/session`)
- [ ] Google OAuth (after email/password works) — register redirect URI `https://staging.balikha.ph/api/auth/callback/google` in Google Console
- [ ] **Verify Better Auth route surface** (see "Better Auth route surface" table above): test every route flows through Next.js rewrites to Hono. If any route needs a Next.js `app/api/` handler, stop and discuss.
- [ ] **Tests:** Vitest for auth routes (mock DB), RTL for login/register forms, Playwright e2e for full register → login → access protected route → logout flow, plus end-to-end Google OAuth test in Playwright

### Step 2 — Seller dashboard
- [ ] Create shop (name, slug, bio, banner image). Validate slug server-side: regex `^[a-z0-9-]{3,40}$` + reserved-words list (see schema section). Reject non-conforming or reserved slugs with 400.
- [ ] Add item (name, description, price, photos, category, stock). `photos` stores S3 keys, never URLs.
- [ ] Edit / delete item
- [ ] Toggle item availability (available / sold out)
- [ ] **Upload endpoint (BLOCKS this step) — secure-by-construction `/api/upload`:**
    - [ ] `requireRole(['seller', 'admin'])` middleware — no anonymous uploads
    - [ ] MIME allowlist: `image/jpeg`, `image/png`, `image/webp` ONLY (NO SVG — XSS vector)
    - [ ] Verify magic bytes with `file-type` package — do NOT trust `Content-Type` from client
    - [ ] Generate S3 key server-side: `items/${crypto.randomUUID()}.${extFromMime(mime)}`. NEVER include `file.name` in the key (path traversal)
    - [ ] Max file size: 5 MB (per-request `Content-Length` check + Hono body-size middleware)
    - [ ] Stream to MinIO via `putObject(stream)` — do NOT buffer the whole file in memory (DoS surface)
    - [ ] Per-session rate limit: 20 uploads/minute (see Observability & Protection section)
    - [ ] Returns the S3 key, NOT a URL. Frontend builds the public URL via `STORAGE_PUBLIC_BASE_URL` helper.
    - [ ] Tests: unauthenticated → 401, wrong MIME → 415, oversize → 413, valid → 200 + key

### Step 3 — Public catalog
- [ ] Browse all items (paginated). **Pagination:** `limit/offset` for MVP (defaults: `limit=24`, max `100`). Migrate to cursor-based post-MVP if catalog grows past ~10k items.
- [ ] Filter by category and shop. Verify the `items_category_available_idx` and `items_shop_idx` are used (`EXPLAIN ANALYZE` the queries during dev).
- [ ] Item detail page with photo gallery. URLs built from `STORAGE_PUBLIC_BASE_URL + photos[i]` via the helper, never stored absolute.
- [ ] Seller shop page (lookup by slug — case-sensitive)
- [ ] Add a Next.js route guard / middleware that returns 404 for any URL whose first segment matches the reserved-words list, so a seller named `admin` cannot collide with the admin route

### Step 4 — Cart
- [ ] Add to cart (client-side state, Zustand persisted to localStorage)
- [ ] **Single-shop enforcement (BLOCKING):** When the user adds an item from a different shop than the cart's existing items, show a confirmation modal: *"Your cart has items from ShopA. Adding this item from ShopB will replace your cart contents. Continue?"*. Only on confirm: clear cart, add new item.
- [ ] **Cart contract — no silent drops, no silent price updates** (per CLAUDE.md "no fallback logic" rule):
    - [ ] On cart load and on every cart page open, the client re-fetches each item's current `price`, `stock`, `available` from `/api/items/batch?ids=...`
    - [ ] If `price` changed: show an explicit warning banner per item ("Price changed from ₱X to ₱Y"). Do NOT auto-update the displayed total — require user acknowledgement.
    - [ ] If `available === false` or `stock < cartQty`: show an explicit warning. Do NOT auto-remove. User must click "Remove" to clear.
    - [ ] At checkout, the server is the source of truth — any mismatch returns a 409 error that the user sees.
- [ ] Cart drawer / cart page
- [ ] Remove items, update quantity
- [ ] Cart persists across page reloads (localStorage)
- [ ] **Cart-on-login behavior:** When an anonymous user with a non-empty cart logs in, the cart is preserved as-is (no server-side cart in MVP). Documented as a known limitation.

### Step 5 — Checkout + PayMongo
- [ ] Buyer fills shipping address
- [ ] Order summary with total (computed server-side, not trusting client)
- [ ] **Single-shop assertion (server-side):** Reject the checkout request with 400 if the cart contains items from more than one `shopId`. Defense in depth — the client modal in Step 4 prevents this, but the server enforces it.
- [ ] **Checkout transaction (atomic, document this exact sequence):**
    1. Begin DB transaction
    2. `SELECT ... FROM items WHERE id IN (...) FOR UPDATE` — row locks on all cart items
    3. Verify each item: `available === true` AND `stock >= requestedQty`. On failure → ROLLBACK + return 409 with which item failed.
    4. **Recompute `subtotalAmount` server-side** from the locked `items.price` values. Do NOT trust any client-supplied total.
    5. `subtotalAmount + shippingAmount(0) + taxAmount(0) → totalAmount`
    6. Decrement `items.stock` by the requested quantities
    7. Insert `orders` row (`status: 'pending'`, computed amounts, `currency: 'PHP'`)
    8. Insert `order_items` rows with `priceAtPurchase` snapshotted from the locked prices
    9. COMMIT
    10. Call PayMongo `createPaymentLink` with the order id in `remarks`
    11. Return the payment link URL
- [ ] **Pending-order cleanup job:** A cron (or a startup `setInterval`) that finds `orders` where `status='pending' AND createdAt < now() - 30 minutes`, releases the stock back to `items`, and marks the order `cancelled`. Prevents infinite inventory hold from abandoned carts.
- [ ] Redirect buyer to PayMongo checkout
- [ ] Webhook updates order status to `paid` (see PayMongo integration section — signature verified, idempotent, amount-checked)
- [ ] **Tests:** Vitest concurrent-checkout test (two parallel requests for the last unit — exactly one wins, the other gets 409). Vitest tampered-total test (client sends wrong `totalAmount` in body — server still computes correctly). Vitest pending-cleanup test.

### Step 6 — Order management (seller)
- [ ] Seller sees incoming paid orders
- [ ] Seller marks order as `processing` then `shipped`
- [ ] Seller enters courier name + tracking URL manually
- [ ] Buyer can see tracking info on their order page

### Step 7 — Buyer order history
- [ ] List all buyer orders with status
- [ ] Order detail: items, total, courier, tracking link

---

## File upload flow (MinIO)

```
Browser → POST /api/upload (auth required, MIME-checked, size-limited)
  → Next.js rewrites → Hono backend
  → magic-byte verify (file-type)
  → stream to MinIO with server-generated key
  → returns S3 KEY (not URL)
  → key saved to items.photos[] in Postgres
  → public URL built at READ time via STORAGE_PUBLIC_BASE_URL helper
```

### Upload route — secure-by-construction

```ts
// backend/src/routes/upload.ts (Hono route)
import crypto from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { Readable } from 'node:stream'
import { minioClient } from '../lib/minio.js'
import { requireRole } from '../middleware/requireRole.js'

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

app.post('/api/upload', requireRole(['seller', 'admin']), async (c) => {
  // 1. Pre-check Content-Length (cheap rejection before reading body)
  const contentLength = Number(c.req.header('content-length') ?? 0)
  if (contentLength > MAX_BYTES) return c.json({ error: 'file too large' }, 413)

  const formData = await c.req.formData()
  const file = formData.get('file')
  if (!(file instanceof File)) return c.json({ error: 'no file' }, 400)
  if (file.size > MAX_BYTES) return c.json({ error: 'file too large' }, 413)

  // 2. Read enough bytes to verify magic bytes (do NOT trust file.type from client)
  const buffer = Buffer.from(await file.arrayBuffer())
  const detected = await fileTypeFromBuffer(buffer)
  if (!detected || !ALLOWED_MIMES.has(detected.mime)) {
    return c.json({ error: 'unsupported file type' }, 415)
  }

  // 3. Generate the S3 key SERVER-SIDE — never include user-supplied filename
  const key = `items/${crypto.randomUUID()}.${MIME_TO_EXT[detected.mime]}`

  // 4. Stream to MinIO (use Readable.from for the buffer; for >5MB switch to true streaming)
  await minioClient.putObject(
    process.env.MINIO_BUCKET!,
    key,
    Readable.from(buffer),
    buffer.length,
    { 'Content-Type': detected.mime }
  )

  // 5. Return the KEY only — frontend builds URL via STORAGE_PUBLIC_BASE_URL
  return c.json({ key })
})
```

### Public URL helper (read-time URL building)

```ts
// backend/src/lib/storage.ts (and mirror in frontend/src/lib/storage.ts)
const BASE = process.env.STORAGE_PUBLIC_BASE_URL // e.g. https://staging.balikha.ph/storage

export function publicUrl(key: string): string {
  if (!BASE) throw new Error('STORAGE_PUBLIC_BASE_URL not set')
  return `${BASE}/${process.env.MINIO_BUCKET}/${key}`
}
```

> **Why:** Storing only S3 keys decouples the DB from domain/storage layout changes. If you ever migrate to a CDN or change domains, no DB rewrite is needed — only the env var changes.

---

## Linode server setup

### Server stack

```
Linode (Ubuntu 22.04, 8GB recommended)
├── Traefik v3             ← reverse proxy, auto Let's Encrypt SSL
└── Docker Compose (per environment)
    ├── Next.js frontend   ← Traefik routes here, rewrites proxy /api/* to backend
    ├── Hono backend       ← internal only, not exposed to Traefik
    ├── PostgreSQL 16      ← internal only
    └── MinIO              ← /storage proxied via Traefik for public image URLs
```

### Routing (Traefik)

Traefik routes by subdomain via Docker labels. No Nginx config files.

- `staging.balikha.ph` → `staging-frontend:3000` (Next.js rewrites `/api/*` to `staging-backend:8787`)
- `preprod.balikha.ph` → `preprod-frontend:3000` (Next.js rewrites `/api/*` to `preprod-backend:8787`)
- `staging.balikha.ph/storage/*` → `staging-minio:9000` (path-prefix middleware strips `/storage`); same for preprod
- The backend is never exposed to Traefik — only reachable via the internal Docker network from Next.js

### Network topology (per-environment isolation)

Three Docker networks per environment + one shared proxy network:

```yaml
# docker-compose.proxy.yml — Traefik
networks:
  balikha-proxy:
    external: true   # docker network create balikha-proxy

# docker-compose.staging.yml
networks:
  balikha-proxy:
    external: true             # joins Traefik to reach staging-frontend + staging-minio
  staging-internal:
    driver: bridge             # NOT external; private to staging only
services:
  staging-db:
    networks: [staging-internal]   # NOT on balikha-proxy
  staging-backend:
    networks: [staging-internal]   # NOT on balikha-proxy — only reachable from staging-frontend
  staging-frontend:
    networks: [balikha-proxy, staging-internal]
  staging-minio:
    networks: [balikha-proxy, staging-internal]
```

**Why two networks per env:** Traefik must reach `staging-frontend` and `staging-minio`, but `staging-db` and `staging-backend` MUST NOT be reachable from any other environment. The internal `staging-internal` bridge isolates them. `preprod-internal` is a separate network — preprod containers cannot accidentally reach staging.

**Representative Traefik labels:**
```yaml
staging-frontend:
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.staging-frontend.rule=Host(`staging.balikha.ph`) && !PathPrefix(`/storage`)"
    - "traefik.http.routers.staging-frontend.entrypoints=websecure"
    - "traefik.http.routers.staging-frontend.tls.certresolver=letsencrypt"
    - "traefik.http.services.staging-frontend.loadbalancer.server.port=3000"

staging-minio:
  labels:
    - "traefik.enable=true"
    - "traefik.http.routers.staging-storage.rule=Host(`staging.balikha.ph`) && PathPrefix(`/storage`)"
    - "traefik.http.routers.staging-storage.entrypoints=websecure"
    - "traefik.http.routers.staging-storage.tls.certresolver=letsencrypt"
    - "traefik.http.routers.staging-storage.middlewares=storage-strip"
    - "traefik.http.middlewares.storage-strip.stripprefix.prefixes=/storage"
    - "traefik.http.services.staging-minio.loadbalancer.server.port=9000"
```

### Let's Encrypt / ACME

- **Challenge type:** HTTP-01 (default). Traefik responds on port 80 directly. No DNS provider integration needed.
- **Wildcard certs:** Not used in MVP. Each environment has its own cert (`staging.balikha.ph`, `preprod.balikha.ph`).
- **Cert storage:** `/opt/balikha/traefik/acme.json` (chmod 600), persisted via Docker volume so re-creating Traefik doesn't lose certs.
- **Initial test:** First deploy uses `caServer: https://acme-staging-v02.api.letsencrypt.org/directory` to avoid LE rate limits. Once routing works, switch to production ACME endpoint.

### Dockerfiles

Two separate Dockerfiles, both using `node:22-alpine`:

- **`backend/Dockerfile`** — multi-stage: deps → builder → runner. Entrypoint runs `drizzle-kit migrate` before server start. Non-root user. Exposes 8787.
- **`frontend/Dockerfile`** — multi-stage: deps → builder → runner. Uses `output: 'standalone'`. Non-root user. Exposes 3000.

### Linode firewall rules (UFW)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80    # HTTP (Traefik, redirects to HTTPS)
sudo ufw allow 443   # HTTPS (Traefik)
sudo ufw enable

# All other ports blocked — Traefik handles all routing
```

---

## Deployment

### Branch strategy

```
feature/xxx → PR → staging branch → auto-deploy to staging.balikha.ph
staging → PR → main branch → auto-deploy to preprod.balikha.ph
```

### CI/CD pipeline (GitHub Actions + ghcr.io)

Images are built in CI and pushed to GitHub Container Registry. The VPS only pulls pre-built images — no source code on the server, no OOM risk during builds.

**Pipeline structure (per environment):**

```
┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐
│ lint+typecheck     │  │ backend unit tests │  │ frontend unit tests│  ← parallel
│ (backend+frontend) │  │ (vitest, mocked DB)│  │ (vitest + RTL)     │
└─────────┬──────────┘  └─────────┬──────────┘  └─────────┬──────────┘
          └────────────────────────┴────────────────────────┘
                                   │
                                   ▼
                      ┌──────────────────────────┐
                      │ build backend image      │  ← BuildKit cache from ghcr
                      │ build frontend image     │
                      │ (parallel matrix jobs)   │
                      └─────────────┬────────────┘
                                    │
                                    ▼
                      ┌──────────────────────────┐
                      │ frontend build smoke test│  ← `docker run frontend-image` with no backend
                      │ (catches Issue 6: must NOT│   running. Verifies dynamic-rendering
                      │  fetch at build time)    │   contract holds.
                      └─────────────┬────────────┘
                                    │
                                    ▼
                      ┌──────────────────────────┐
                      │ e2e against built images │  ← compose up with built images,
                      │ (Playwright headless)    │   wait for /api/health/ready 200,
                      │                          │   run e2e suite, tear down
                      └─────────────┬────────────┘
                                    │
                                    ▼
                      ┌──────────────────────────┐
                      │ push images to ghcr.io   │  ← only on main/staging branches
                      └─────────────┬────────────┘
                                    │
                                    ▼
                      ┌──────────────────────────┐
                      │ SSH deploy to VPS        │  ← docker compose pull + up -d
                      └──────────────────────────┘
```

**Concrete details:**
- **Runner:** `ubuntu-latest` standard runner (4 vCPU, 16 GB) is sufficient
- **Postgres + MinIO for e2e:** spun up via the same compose file used in dev (`docker-compose.yml`) so prod-parity. NOT GitHub service containers.
- **Image build cache:** `cache-from: type=registry,ref=ghcr.io/yourorg/balikha-backend:cache` keeps cold-cache builds < 90s
- **Test parallelization:** lint, backend tests, frontend tests run as 3 parallel jobs in the same workflow
- **Flaky e2e:** Playwright `retries: 1` in CI only (not local). If a test fails twice, the build fails — flakes get fixed, not papered over.
- **Secrets in e2e:** `AUTH_SECRET=test-secret-32-chars-fixed-value-ok`, `PAYMONGO_SECRET_KEY=sk_test_<sandbox-key-from-actions-secret>`, `PAYMONGO_WEBHOOK_SECRET=test-webhook-secret`. PayMongo sandbox keys live in GitHub Actions secrets.
- **Frontend build smoke test command:** `docker build -t balikha-frontend-test ./frontend && docker run --rm balikha-frontend-test node -e "console.log('build ok')"` — must succeed without any backend reachable.

Two workflow files:
- `.github/workflows/deploy-staging.yml` — triggers on push to `staging`
- `.github/workflows/deploy-preprod.yml` — triggers on push to `main`

### Secret management

**MVP-level approach** (acknowledged trade-off):
- **First deploy:** env files are hand-provisioned via SCP over SSH:
  ```bash
  scp .env.staging.local deploy@vps:/opt/balikha/.env.staging
  ssh deploy@vps "chmod 600 /opt/balikha/.env.staging"
  ```
- **Updates:** `ssh deploy@vps + vim /opt/balikha/.env.staging`. Acknowledged as MVP-level — manual but auditable.
- **CI secrets** (for e2e tests, ghcr.io login, SSH key): live in GitHub Actions secrets. Never committed.
- **`AUTH_SECRET` rotation:** Better Auth invalidates ALL active sessions on rotation. Rotation requires a planned downtime announcement and a forced re-login for all users. Not done casually.
- **TODO post-MVP:** migrate to Doppler / SOPS / Infisical for centralized secret rotation without SSH'ing into the VPS.

**Secret inventory (lives in GitHub Actions secrets):**
- `GHCR_TOKEN` — push images
- `DEPLOY_SSH_KEY` — SSH into VPS
- `DEPLOY_HOST` — VPS hostname
- `PAYMONGO_TEST_SECRET_KEY` — for e2e PayMongo sandbox
- `PAYMONGO_TEST_WEBHOOK_SECRET` — for e2e webhook signature tests

### Rollback

With container registry, rollback is: retag the previous good image and `docker compose pull && up -d`.

### Manual deploy (fallback)

```bash
ssh deploy@your-linode-ip
cd /opt/balikha
docker compose -f docker-compose.staging.yml pull
docker compose -f docker-compose.staging.yml up -d
```

### First-time server setup

```bash
# On a fresh Linode Ubuntu 22.04 instance (8GB recommended)
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2 git ufw

sudo systemctl enable docker
sudo systemctl start docker

# Firewall
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable

# Deploy user
sudo adduser deploy
sudo usermod -aG docker deploy

# DNS: A records for staging.balikha.ph and preprod.balikha.ph → Linode IP

# Setup
su - deploy
mkdir -p /opt/balikha/traefik
cd /opt/balikha

# Copy compose files from repo (or scp them)
# Create env files
cp .env.example .env.staging
cp .env.example .env.preprod
nano .env.staging   # fill in real values
nano .env.preprod   # fill in real values
chmod 600 .env.staging .env.preprod

# Traefik cert storage
touch traefik/acme.json && chmod 600 traefik/acme.json

# Create shared Docker network
docker network create balikha-proxy

# Login to container registry
echo $GHCR_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Start Traefik (use LE staging endpoint first to test)
docker compose -f docker-compose.proxy.yml up -d

# Deploy environments
docker compose -f docker-compose.staging.yml pull && docker compose -f docker-compose.staging.yml up -d
docker compose -f docker-compose.preprod.yml pull && docker compose -f docker-compose.preprod.yml up -d
```

---

## Backup & disaster recovery

**Threats covered:** disk failure, accidental table drop, malicious data deletion, MinIO volume loss, full VPS loss.

**Threats NOT covered (acknowledged):** ransomware encrypting both VPS and off-site bucket simultaneously (would require air-gapped backups, post-MVP).

### Daily Postgres backups (VPS-local)

```bash
# /opt/balikha/scripts/backup-db.sh
#!/bin/bash
set -euo pipefail
BACKUP_DIR=/opt/balikha/backups

for ENV in staging preprod; do
  mkdir -p $BACKUP_DIR/$ENV
  docker exec ${ENV}-db pg_dump -U balikha balikha \
    | gzip > $BACKUP_DIR/$ENV/balikha-$(date +%Y%m%d-%H%M%S).sql.gz
done

# Keep only last 14 days locally
find $BACKUP_DIR -name "*.sql.gz" -mtime +14 -delete
```

### Daily MinIO backup (VPS → off-site)

```bash
# /opt/balikha/scripts/backup-minio.sh
#!/bin/bash
set -euo pipefail
# Mirror MinIO bucket to Linode Object Storage (or B2) via mc
mc mirror --overwrite --remove staging-minio/balikha linode-objstore/balikha-staging-mirror
mc mirror --overwrite --remove preprod-minio/balikha linode-objstore/balikha-preprod-mirror
```

### Off-site DB sync

```bash
# /opt/balikha/scripts/backup-offsite.sh
#!/bin/bash
set -euo pipefail
# Sync the local backup directory to Linode Object Storage
mc mirror --overwrite /opt/balikha/backups linode-objstore/balikha-db-backups
```

### Cron schedule

```bash
chmod +x /opt/balikha/scripts/backup-*.sh
crontab -e
# 0 2 * * * /opt/balikha/scripts/backup-db.sh
# 0 3 * * * /opt/balikha/scripts/backup-minio.sh
# 0 4 * * * /opt/balikha/scripts/backup-offsite.sh
```

### Restore drill (run weekly, automated where possible)

```bash
# Spin up scratch Postgres, restore most recent dump, count rows in critical tables
docker run --rm -d --name restore-test -e POSTGRES_PASSWORD=test postgres:16
gunzip -c /opt/balikha/backups/staging/balikha-LATEST.sql.gz | docker exec -i restore-test psql -U postgres
docker exec restore-test psql -U postgres -c "SELECT count(*) FROM orders, items, shops, \"user\";"
docker rm -f restore-test
```

A backup that has never been restored is not a backup. The restore drill is a HARD requirement before the first real seller onboards.

### Prerequisite for first real seller onboarding

**Before any non-developer seller is allowed to upload product photos**, all of the following must be in place and verified:
1. Daily DB dump cron is running and producing files in `/opt/balikha/backups/`
2. Daily MinIO mirror cron is running and the off-site bucket has > 0 objects
3. Off-site DB sync cron is running
4. Restore drill has been executed end-to-end successfully and row counts match
5. The restore procedure is documented in this plan with the exact commands and credentials

---

## Environment variables

### Strategy

| File | Committed | Purpose |
|------|-----------|---------|
| `.env.development` | Yes | Safe local-only defaults (Docker service names, default passwords) |
| `.env.example` | Yes | Template with `CHANGE_ME` placeholders for all vars |
| `.env.local` | **No** | Developer-specific external service keys (gitignored) |
| `.env.staging` | **No** | VPS only, chmod 600 |
| `.env.preprod` | **No** | VPS only, chmod 600 |

**Rule:** `.env.development` only contains deterministic, local-only values. Any key from an external service (PayMongo, Google OAuth, Better Auth secret) goes in `.env.local` (gitignored).

### URL variable conventions (read carefully)

`API_URL` was overloaded — used by both SSR fetches and `next.config.ts` rewrites at two different lifecycle phases. Split into clearly-named vars:

| Variable | Used by | Read at | Purpose |
|---|---|---|---|
| `API_URL_INTERNAL` | Next.js SSR fetch + `next.config.ts` rewrites destination | Build (rewrites) + runtime (SSR) | Docker service name; internal-only |
| `APP_PUBLIC_URL` | Better Auth `baseURL`, OAuth callback registration, email links, Open Graph URLs | Runtime | Public HTTPS URL |
| `STORAGE_PUBLIC_BASE_URL` | URL helper builds image URLs from S3 keys | Runtime | Public storage prefix (browser-resolvable) |
| `MINIO_ENDPOINT` | Backend uploading files to MinIO | Runtime | INTERNAL only — never exposed to browsers |

The old `MINIO_PUBLIC_URL` is renamed to `STORAGE_PUBLIC_BASE_URL` to make its purpose unambiguous.

### .env.development (committed) — local Docker Compose

```env
NODE_ENV=development

# Postgres
POSTGRES_DB=balikha
POSTGRES_USER=balikha
POSTGRES_PASSWORD=secret
DATABASE_URL=postgresql://balikha:secret@db:5432/balikha

# MinIO (internal Docker name; not browser-resolvable)
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=balikha
MINIO_SECRET_KEY=balikhasecret
MINIO_BUCKET=balikha

# Storage public URL — in dev, browsers reach MinIO via the host port mapping
STORAGE_PUBLIC_BASE_URL=http://localhost:9000

# Next.js → backend
API_URL_INTERNAL=http://backend:8787
APP_PUBLIC_URL=http://localhost:3000

# Auth (deterministic local-only secrets — NEVER use in staging/prod)
AUTH_SECRET=dev-only-secret-32-chars-fixed-ok
# AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET live in .env.local (gitignored)

# CORS (Hono allows the Next.js dev origin)
CORS_ORIGINS=http://localhost:3000

# PayMongo — sandbox keys live in .env.local
```

### .env.staging (VPS only, not in git) — staging.balikha.ph

```env
NODE_ENV=production

# Postgres
POSTGRES_DB=balikha
POSTGRES_USER=balikha
POSTGRES_PASSWORD=<openssl rand -base64 32>
DATABASE_URL=postgresql://balikha:<password>@staging-db:5432/balikha

# Better Auth
AUTH_SECRET=<openssl rand -base64 64>
AUTH_GOOGLE_ID=<google-oauth-client-id-for-staging.balikha.ph>
AUTH_GOOGLE_SECRET=<google-oauth-secret>

# PayMongo (test keys for staging)
PAYMONGO_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxx
PAYMONGO_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxxxxxxxxxx
PAYMONGO_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx

# MinIO
MINIO_ENDPOINT=http://staging-minio:9000
MINIO_ACCESS_KEY=<openssl rand -base64 24>
MINIO_SECRET_KEY=<openssl rand -base64 32>
MINIO_BUCKET=balikha

# Storage public URL — Traefik routes /storage/* to staging-minio
STORAGE_PUBLIC_BASE_URL=https://staging.balikha.ph/storage

# Next.js
API_URL_INTERNAL=http://staging-backend:8787
APP_PUBLIC_URL=https://staging.balikha.ph

# CORS
CORS_ORIGINS=https://staging.balikha.ph
```

### .env.preprod (VPS only, not in git) — preprod.balikha.ph

```env
NODE_ENV=production

# Postgres
POSTGRES_DB=balikha
POSTGRES_USER=balikha
POSTGRES_PASSWORD=<openssl rand -base64 32>   # DIFFERENT from staging
DATABASE_URL=postgresql://balikha:<password>@preprod-db:5432/balikha

# Better Auth
AUTH_SECRET=<openssl rand -base64 64>          # DIFFERENT from staging
AUTH_GOOGLE_ID=<google-oauth-client-id-for-preprod.balikha.ph>
AUTH_GOOGLE_SECRET=<google-oauth-secret>

# PayMongo (live keys for preprod — handle with care)
PAYMONGO_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxxxxx
PAYMONGO_PUBLIC_KEY=pk_live_xxxxxxxxxxxxxxxxxxxxxxxx
PAYMONGO_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxxxxx

# MinIO
MINIO_ENDPOINT=http://preprod-minio:9000
MINIO_ACCESS_KEY=<openssl rand -base64 24>     # DIFFERENT from staging
MINIO_SECRET_KEY=<openssl rand -base64 32>     # DIFFERENT from staging
MINIO_BUCKET=balikha

# Storage public URL
STORAGE_PUBLIC_BASE_URL=https://preprod.balikha.ph/storage

# Next.js
API_URL_INTERNAL=http://preprod-backend:8787
APP_PUBLIC_URL=https://preprod.balikha.ph

# CORS
CORS_ORIGINS=https://preprod.balikha.ph
```

> **Important:** every secret-looking value in staging and preprod is **independent** — never share `AUTH_SECRET`, DB password, or MinIO keys across environments. The Google OAuth client IDs are also separate (each environment registers its own redirect URI in Google Console).

---

## Observability & Protection

The plan's "no error swallowing" rule (CLAUDE.md) requires errors to go somewhere. This section is the "where."

### Structured logging (Hono middleware)

- **Library:** `hono-pino` (or `pino` directly via `app.use(logger)`)
- **Per-request fields:** `requestId` (uuid), `method`, `path`, `status`, `durationMs`, `userId` (if session), `ip`
- **Levels:** `info` for 2xx/3xx, `warn` for 4xx, `error` for 5xx
- **Format:** JSON in production, pretty-print in dev
- **Output:** stdout (Docker captures it; aggregated by `docker logs` for MVP)

### Request ID propagation

- Hono middleware sets `c.set('requestId', crypto.randomUUID())` on every request
- All log lines for the request include this ID
- Returned to the client in `X-Request-Id` response header so browser console errors can be matched to backend logs

### Rate limiting (`hono-rate-limiter` or equivalent)

| Endpoint | Limit | Key |
|---|---|---|
| `POST /api/auth/sign-in/*` | 5 / minute | IP |
| `POST /api/auth/sign-up/email` | 3 / minute | IP |
| `POST /api/auth/forgot-password` | 3 / 15 min | IP |
| `POST /api/upload` | 20 / minute | session userId |
| `POST /api/orders` (checkout) | 10 / minute | session userId |
| `POST /api/webhooks/paymongo` | unlimited | (signature is the gate) |

Rate limit storage: in-memory for MVP (single backend container). Switch to Redis if/when scaling out.

### Error monitoring (Sentry or self-hosted Glitchtip)

- **MVP choice:** Sentry SaaS free tier (5k errors/month) — fastest setup
- **Integration:** `@sentry/node` initialized in `backend/src/index.ts`; `@sentry/nextjs` in `frontend/`
- **CRITICAL — must NOT swallow:** All `try/catch` blocks that report to Sentry MUST also re-throw or return an explicit error to the caller. Per CLAUDE.md, reporting to Sentry without re-raising = error swallowing. Forbidden.
- **What to report:**
  - Unhandled exceptions (automatic via Sentry middleware)
  - PayMongo webhook signature failures
  - PayMongo amount mismatches (potential fraud signal)
  - Migration failures at startup
  - 5xx responses from any endpoint
- **Alerting:** Sentry email alert on any error in `webhooks/paymongo.ts` (send immediately). Other errors: daily digest.

### When each lands in the build order

- **Structured logging + request IDs:** Step 1 (Auth) — needed for debugging auth flows
- **Rate limiting on `/api/auth/*`:** Step 1 (Auth) — required before Google OAuth ships
- **Sentry for backend:** Step 1 (Auth) — early so all subsequent errors are captured
- **Rate limiting on `/api/upload`:** Step 2 (Seller dashboard) — ships with the upload endpoint
- **Rate limiting on `/api/orders`:** Step 5 (Checkout)
- **PayMongo webhook alerting:** Step 5 (Checkout)

---

## Logistics (MVP)

No courier API integration for now. Seller manually:
1. Ships the order using courier of their choice (J&T, LBC, Ninja Van, etc.)
2. Enters courier name + tracking URL in the seller dashboard
3. Marks order as `shipped`

Buyer sees the courier name and tracking URL on their order page.

**Future:** Integrate J&T Express or Ninja Van API when order volume justifies it.

---

## Known MVP limitations

These are deliberate trade-offs accepted for the MVP. Each one has a clear migration path post-MVP.

- **Single-shop cart:** A buyer's cart can only contain items from one shop at a time. Adding an item from a different shop shows a confirmation modal that replaces the cart. Multi-shop carts with split orders are deferred (see Future features).
- **Cart on login:** Cart is client-side only (localStorage + Zustand). When an anonymous user logs in, the cart is preserved as-is. There is no server-side cart merge.
- **Free shipping, no VAT:** `orders.shippingAmount` and `taxAmount` default to 0. The first seller is the developer/owner and is not VAT-registered. Schema is forward-compatible.
- **In-memory rate limiting:** Single backend container per environment, so in-memory state is fine. Multi-container = switch to Redis.
- **Manual env file provisioning:** `.env.staging` and `.env.preprod` are SCP'd to the VPS once and edited via `ssh + vim` thereafter. No Doppler/SOPS/Infisical until post-MVP.
- **Single backend container per env:** Migrations are run in the entrypoint with `set -e`. Safe because only one container runs them. Multi-container scale-out requires an init container or leader lock.
- **`AUTH_SECRET` rotation = forced re-login:** Better Auth invalidates all sessions on rotation. Document downtime windows.
- **Pending-order stock hold:** Stock is locked when an order is created with `status: pending`. A cleanup cron releases stock from orders older than 30 minutes. Buyers with very slow PayMongo flows (> 30 min) will see "out of stock" on resume.
- **No CDN for images:** MinIO serves directly behind Traefik. Performance is adequate for MVP traffic. Switch to a CDN (BunnyCDN, Cloudflare R2) post-MVP.
- **MinIO single-node (durability via off-site mirror):** No erasure coding, no multi-node MinIO. Off-site mirror to Linode Object Storage is the only durability layer. See Backup & disaster recovery.

---

## Future features (post-MVP)

- [ ] Reviews and ratings per item
- [ ] Seller payout system (manual bank transfer → automated)
- [ ] Multi-item cart across multiple sellers (split orders)
- [ ] Search with full-text (Postgres `tsvector`)
- [ ] Courier API integration (J&T, Ninja Van)
- [ ] Stripe for international buyers
- [ ] Admin moderation dashboard
- [ ] Email notifications (Resend or Nodemailer)
- [ ] Seller analytics (views, sales, top items)
