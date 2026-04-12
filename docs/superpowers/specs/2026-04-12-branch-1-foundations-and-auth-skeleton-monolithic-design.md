---
title: "Branch 1 — Foundations and Auth Skeleton (Monolithic)"
date: 2026-04-12
branch: feature/foundations-and-auth-skeleton
parent_plan: /app-plan.md
supersedes: /Users/pul/Projects/Others/Claude Project Plans/gpul-pottery/balikha/docs/superpowers/specs/2026-04-12-branch-1-foundations-and-auth-skeleton-design.md
status: revised-after-review-round-1
related_reviews:
  - /Users/pul/.claude/plans/app-plan-plan-review-round-1.md
  - /Users/pul/.claude/plans/2026-04-12-branch-1-foundations-and-auth-skeleton-design-plan-review-round-1.md
  - /Users/pul/.claude/plans/2026-04-12-branch-1-foundations-and-auth-skeleton-monolithic-design-plan-review-round-1.md
---

# Balikha — Branch 1: Foundations and Auth Skeleton (Monolithic)

## 1. Overview

This is the first feature branch of the Balikha marketplace. It establishes the foundational layer every subsequent branch depends on — environment validation, structured logging, CSS Modules styling with design tokens, error pages, and Better Auth with email and password authentication.

It does **not** ship any marketplace features. There are no shops, items, orders, seller dashboards, or admin UIs beyond what auth itself requires. The branch ends when a user can sign up, sign in, see their session on the home page, and sign out.

### Architectural pivot from the original spec

This spec supersedes `2026-04-12-branch-1-foundations-and-auth-skeleton-design.md`, which described a split-service architecture (Hono backend + Next.js frontend talking through `rewrites()`). After a principal-engineer review surfaced multiple correctness issues rooted in the split-service architecture (cookie forwarding, testcontainers ordering, migration race, module-load env validation in tests, and more), the architecture was collapsed to a **monolithic Next.js application** that hosts Better Auth natively via a catch-all route handler. Hono is no longer used. The repository is flattened — the old `backend/` and `frontend/` directories collapse into a single Next.js app at the repo root.

The original spec's review findings are preserved at `~/.claude/plans/2026-04-12-branch-1-foundations-and-auth-skeleton-design-plan-review-round-1.md`. Roughly 12 of the 20 findings are eliminated by the architectural change; the remaining 8 (which are genuine quality improvements orthogonal to the split-service decision) are incorporated into this spec.

### Why this scope

`app-plan.md` is too large for a single branch, so it is being decomposed into per-phase feature branches, each with its own sub-spec, implementation plan, and `/claude-review-against-plan` pass. Branch 1 is the largest of the foundation branches because it establishes cross-cutting scaffolding *and* the first working feature (auth). Subsequent branches are narrower because this one does the heavy setup work once.

## 2. Locked decisions

### 2.1 Architecture: monolithic Next.js 16

Single Next.js process. No separate backend service. No reverse-proxy routing. No cookie forwarding between services. Better Auth mounts via a first-party Next.js catch-all route handler at `src/app/api/auth/[...all]/route.ts`. Database access happens in the same Node process that renders pages, so session refresh, RBAC checks, and admin actions can run as direct function calls in server components via `auth.api.getSession({ headers: await headers() })`.

### 2.2 No Hono

The original spec used Hono for the backend. With monolithic architecture, Hono's strengths (framework-agnostic Web Standards router, standalone service) don't apply. Branch 1 removes Hono entirely and uses Next.js's built-in route handler API. If a future use case genuinely justifies Hono (e.g., a separately-deployed API for a mobile client), it lands then as a scoped decision, not as a foundational commitment.

### 2.3 Repo flattening

The existing `backend/` and `frontend/` directories collapse into a flat Next.js layout at the repo root. The repo **is** the Next.js app. Server-only code lives under `src/server/` with an `import 'server-only'` guard at the top of every module. `src/lib/auth.ts` also imports `'server-only'` because it is server-only code even though it lives outside `src/server/` (placed at `src/lib/` for Better Auth CLI auto-discovery). This rename lands in the first commit of the branch.

### 2.4 Environment variable shape

- `NODE_ENV` with canonical Node values (`development | production | test`). Staging sets `NODE_ENV=production`.
- `DATABASE_URL` — PostgreSQL connection string.
- `AUTH_SECRET` — Better Auth secret, minimum 32 characters.
- `APP_URL` — public HTTPS URL used by Better Auth `baseURL` and for canonical URLs. In dev, `http://localhost:3000`.

That's it. Four variables. No more `API_URL_INTERNAL` vs `APP_PUBLIC_URL` split. No `CORS_ORIGINS` because everything is same-origin.

Files are named `.env.development`, `.env.staging`, `.env.production` (the `.env.preprod` → `.env.production` rename is locked for later deployment branches; branch 1 only touches `.env.development` and `.env.example`).

### 2.5 Styling approach

- **CSS Modules only** with CSS custom properties for design tokens. Tailwind is removed from the repo in this branch.
- No runtime CSS-in-JS. No static inline styles. Dynamic values (computed at runtime from props/state) may use the React `style` prop; everything else lives in a `*.module.css` file.
- Design tokens live in `src/styles/tokens.css` and are imported before `globals.css` in `layout.tsx`.

### 2.6 Brand palette (approved, unchanged from the original spec)

- **Primary** — Deep Red `#8C1C13` (CTAs, brand headers) — 8.2:1 on cream, AAA.
- **Secondary** — Black `#1C1C1C` (strong text, icons) — 15.3:1, AAA.
- **Accent** — Gold `#D4A373` (**decorative only** — backgrounds, borders, badges) — 2.0:1 on cream, fails text standards.
- **Accent (text)** — Dark gold `#7A5C0D` (text-safe gold companion) — 5.55:1, AA normal.
- **Background** — Cream `#F6F1E9` (page surface).
- **Support** — Rust `#B55239` (original, unchanged). 4.4:1 on cream — usage restricted to button backgrounds, large headings (18pt+ or 14pt bold+), borders, and large icons. Never body text.

Dark mode uses warm chocolate `#1F1612` as the page surface with brightened brand color variants. Full token set in section 5.

### 2.7 Auth configuration

- **Email and password only** in branch 1. Google OAuth deferred to `feature/oauth-google`.
- **Email verification disabled** (`requireEmailVerification: false`). Password reset similarly deferred until an email transport is configured. Manual admin password reset documented as a workaround.
- **Password minimum length**: 10 characters. No complexity requirements (NIST-style).
- **Session defaults from Better Auth**: 7-day expiration with 1-day rolling refresh. Rolling refresh **now actually works** because the session write happens in the same process as the page render — the `Set-Cookie` flows directly into the Next.js response. The original spec's Issue 1 (Set-Cookie being dropped by `serverFetch`) is eliminated by the architecture.
- **Additional fields** on the Better Auth `user` table: `role` (string, default `'buyer'`, `input: false`) and `avatarUrl` (optional string). The `input: false` flag on `role` is the critical security control. Two Vitest tests guard this: (1) an HTTP-path test that calls `auth.handler(new Request(...))` with `role: 'admin'` in the JSON body and asserts the DB row has `role = 'buyer'` — this is THE PRIMARY security test exercising the real attack surface; (2) a direct `auth.api.signUpEmail` test as defense-in-depth. Neither test must be deleted.

### 2.8 Owner account model (two separate accounts)

The developer/owner uses **two separate accounts**: one with `role='seller'` for all shop-management and merchant work, one with `role='admin'` strictly for administrative tasks. Rationale: principle of least privilege. Documented in `CONVENTIONS.md`.

Because `input: false` prevents self-assignment during signup, both accounts start as `role='buyer'` and must be promoted via a direct SQL update after creation. This workflow is documented in `CONVENTIONS.md` under "Initial account bootstrap" alongside the manual password reset workaround.

### 2.9 Shared API contract strategy — deferred to branch 2

Branch 1 has zero custom API endpoints (only Better Auth's, which have their own types). There is nothing to contract against. `CONVENTIONS.md` commits to **shared Zod schemas in a `packages/contracts/` workspace** for branch 2 and later. The workspace itself is created in `feature/marketplace-schema-rbac` alongside the first CRUD endpoints. No workspace config lands in branch 1.

### 2.10 Implementation isolation — worktree

Implementation work happens in an isolated git worktree created via `superpowers:using-git-worktrees`. The main working directory stays clean. This spec itself is committed to `main` first; implementation then happens in the worktree against a fresh branch.

### 2.11 Drizzle migration strategy — programmatic via `drizzle-orm/migrator`

Migrations run via a standalone script `scripts/migrate.ts` that uses `drizzle-orm/migrator`'s `migrate()` function. No `drizzle-kit` at runtime.

- **Dev**: `npm run db:migrate` runs the script. Wired as a prestart so `npm run dev` migrates before starting the Next.js server.
- **Production** (later branches): the Dockerfile's entrypoint runs `node scripts/migrate.js` (or the compiled equivalent) before starting Next.js.

The original spec's "Option A" (drizzle-kit in runtime image) is dropped. This resolves reviewer Issue 5 cleanly — no dev-deps in the production image, no footgun invariant.

### 2.12 Env validation — module-level constants, throws at import if invalid

`src/server/config/env.ts` exports `parseEnv()` (pure function) and a module-level `export const env` that calls `parseEnv()` at import time. If `env` is imported and the environment is invalid, it throws `EnvValidationError` immediately. No lazy caching, no `getEnv()` wrapper, no `__resetEnvCache`.

Tests that exercise env validation call `parseEnv` with explicit inputs — they never import `env` directly. The `vitest.setup.ts` file sets `NODE_ENV`, `AUTH_SECRET`, and `APP_URL` so that modules importing `env` transitively don't fail during test startup.

## 3. Architecture

### 3.1 Service topology (monolithic)

```
┌─────────┐   HTTPS    ┌───────────────────┐
│ Browser │ ─────────► │ Next.js (single)  │
└─────────┘            │                   │
                       │  ┌─────────────┐  │
                       │  │ Pages, RSCs │  │
                       │  │ Client cmps │  │
                       │  └──────┬──────┘  │
                       │         │         │
                       │  ┌──────▼──────┐  │
                       │  │ Route       │  │
                       │  │ handlers    │  │
                       │  │ (api/)      │  │
                       │  └──────┬──────┘  │
                       │         │         │
                       │  ┌──────▼──────┐  │
                       │  │ src/server  │  │
                       │  │ + lib/auth  │  │
                       │  │ db, config  │  │
                       │  └──────┬──────┘  │
                       └─────────┼─────────┘
                                 │
                           ┌─────▼─────┐
                           │ Postgres  │
                           └───────────┘
```

One process, one deploy, one container. All business logic lives in `src/server/` and `src/lib/auth.ts`. Route handlers in `src/app/api/` are thin adapters that call into server code. Server components call server functions directly — no HTTP indirection.

### 3.2 The fetch-context model is simpler now

Three fetch contexts collapsed to two:

1. **Server component → server code**: a direct function call. No HTTP. No cookie forwarding. No serialization. Better Auth's session read from a server component is literally `await auth.api.getSession({ headers: await headers() })`.

2. **Client component → route handler**: `fetch('/api/auth/sign-in/email', ...)` from a client component. Same-origin, so cookies forward automatically. No custom client helper needed — a thin `apiFetch` utility exists only to standardize the error response shape.

There are no "SSR fetches that need cookie forwarding" and no "three fetch contexts" rule. The architecture is Next.js-canonical.

### 3.3 Server code layer structure and import direction

```
app/api/ ─────────┐
   │              │
   ▼              ▼
app/ components   lib/auth ──► server/db
                                  │
                              server/config ──► server/lib
                                                (logger)
```

Strict one-way dependency graph. `app/` code (pages, layouts, components, route handlers) can import from `server/` and `lib/auth` but neither `server/` nor `lib/auth` imports from `app/`. Inside `server/`, the dependency order is: `auth` depends on `db`. `db` depends on `config` and `lib`. `lib` depends on `config`. `config` depends on nothing.

### 3.4 Server-only boundary enforcement

Every module in `src/server/` imports `'server-only'` at the top. `src/lib/auth.ts` also imports `'server-only'` because it is server-only code (it accesses the database and auth secrets):

```ts
// src/lib/auth.ts
import 'server-only';
// ... rest of the module
```

```ts
// src/server/config/env.ts
import 'server-only';
// ... rest of the module
```

Next.js's bundler replaces `'server-only'` with a build-time throw when a client bundle tries to pull it in, so any accidental leak (e.g., a client component importing from `@/lib/auth` or `@/server/db`) fails the build with a clear error. The boundary is physical, not conventional.

**Exception — standalone scripts.** `scripts/migrate.ts` is a Node.js-only script run via `tsx`, not part of the Next.js module graph. It does **not** import `'server-only'` because that package throws on import in a plain Node context (the webpack substitution only happens in Next.js's bundler). Scripts that need database access construct their own minimal connection rather than importing from `src/server/`. This is the documented exception, not the rule.

### 3.5 Request ID and structured logging

- `src/proxy.ts` runs on every request, generates or sanitizes an `x-request-id` header using Web Crypto (`crypto.randomUUID()`, available as a global in the Node.js runtime), and attaches it to the response. Proxy runs on the Node.js runtime in Next.js 16 (the `runtime` config option is not available in proxy files and throws if set). We still restrict proxy code to Web Standard APIs (`crypto.randomUUID`, `Headers`, `URL`) so the proxy stays lightweight and can move back to Edge if needed without rewrites.
- Route handlers and server components read the request ID via `await headers()` and pass it to the pino logger when logging.
- Per-request structured logging (one log line per request with method/path/status/duration) is deferred to `feature/observability-baseline` — it requires either Node-runtime proxy hooks or instrumentation hooks, both of which add complexity. Branch 1 gets request IDs and ad-hoc logging from route handlers. The cross-cutting request logger lands later.

## 4. Design tokens and styling system

### 4.1 Full `tokens.css`

Lives at `src/styles/tokens.css`. Loaded before `globals.css` in `src/app/layout.tsx`. All `*.module.css` files reference these via `var(--*)`.

```css
:root {
  /* ──────────────────────────────────────────────
     BRAND LAYER
     ────────────────────────────────────────────── */
  --brand-primary:        #8C1C13;
  --brand-primary-hover:  #701810;
  --brand-primary-active: #5A130C;

  --brand-secondary:      #1C1C1C;

  --brand-accent:         #D4A373;   /* DECORATIVE ONLY — fails text contrast */
  --brand-accent-text:    #7A5C0D;   /* text-safe gold companion */

  --brand-bg:             #F6F1E9;

  --brand-support:        #B55239;   /* restricted: not for body text */
  --brand-support-hover:  #954127;
  --brand-support-active: #78321E;

  /* ──────────────────────────────────────────────
     NEUTRAL LAYER — warm-tinted, harmonize with cream
     ────────────────────────────────────────────── */
  --neutral-50:  #FBF8F2;
  --neutral-100: #F6F1E9;
  --neutral-200: #ECE4D4;
  --neutral-300: #D9CDB5;
  --neutral-500: #8A7F6A;
  --neutral-700: #4A4437;
  --neutral-900: #1C1C1C;

  /* ──────────────────────────────────────────────
     SEMANTIC LAYER — distinct from brand red
     ────────────────────────────────────────────── */
  --color-success:     #2E7D4F;
  --color-success-bg:  #E6F2EA;
  --color-warning:     #9B6A0A;
  --color-warning-bg:  #FBF4E3;
  --color-danger:      #C62828;
  --color-danger-bg:   #FBEAEA;
  --color-info:        #1565C0;
  --color-info-bg:     #E7F0FA;

  /* ──────────────────────────────────────────────
     FOCUS RING — simple 2px red
     ────────────────────────────────────────────── */
  --focus-ring-width:  2px;
  --focus-ring-color:  var(--brand-primary);
  --focus-ring-offset: 2px;

  /* ──────────────────────────────────────────────
     SPACING
     ────────────────────────────────────────────── */
  --space-1:  0.25rem;
  --space-2:  0.5rem;
  --space-3:  0.75rem;
  --space-4:  1rem;
  --space-5:  1.25rem;
  --space-6:  1.5rem;
  --space-8:  2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;
  --space-16: 4rem;

  --radius-sm:   0.25rem;
  --radius-md:   0.5rem;
  --radius-lg:   0.75rem;
  --radius-xl:   1rem;
  --radius-full: 9999px;

  --shadow-sm:  0 1px 2px rgba(28, 22, 18, 0.06);
  --shadow-md:  0 4px 8px rgba(28, 22, 18, 0.08);
  --shadow-lg:  0 12px 24px rgba(28, 22, 18, 0.10);

  /* ──────────────────────────────────────────────
     TYPOGRAPHY
     ────────────────────────────────────────────── */
  --font-sans: var(--font-geist-sans), system-ui, -apple-system, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, monospace;

  --text-xs:   0.75rem;
  --text-sm:   0.875rem;
  --text-base: 1rem;
  --text-lg:   1.125rem;
  --text-xl:   1.25rem;
  --text-2xl:  1.5rem;
  --text-3xl:  1.875rem;
  --text-4xl:  2.25rem;

  --leading-tight:  1.2;
  --leading-normal: 1.5;
  --leading-loose:  1.75;

  /* Z-INDEX */
  --z-base:     0;
  --z-raised:   10;
  --z-dropdown: 100;
  --z-sticky:   200;
  --z-overlay:  300;
  --z-modal:    400;
  --z-toast:    500;
}

/* ──────────────────────────────────────────────
   DARK MODE — warm chocolate
   ────────────────────────────────────────────── */
@media (prefers-color-scheme: dark) {
  :root {
    --brand-bg:            #1F1612;
    --neutral-50:          #2A1F18;
    --neutral-100:         #1F1612;
    --neutral-200:         #342820;
    --neutral-300:         #4A3C30;
    --neutral-500:         #8A7F6A;
    --neutral-700:         #C9BFA8;
    --neutral-900:         #F6F1E9;

    --brand-primary:       #C8453A;
    --brand-primary-hover: #D85548;
    --brand-primary-active:#B83B30;

    --brand-accent:        #E6BC8A;
    --brand-accent-text:   #E6BC8A;

    --brand-support:       #D4654A;
    --brand-support-hover: #E07856;
    --brand-support-active:#BE5538;

    --shadow-sm:  0 1px 2px rgba(0, 0, 0, 0.30);
    --shadow-md:  0 4px 8px rgba(0, 0, 0, 0.40);
    --shadow-lg:  0 12px 24px rgba(0, 0, 0, 0.50);
  }
}
```

### 4.2 `globals.css` — reset and base styles

```css
*, *::before, *::after { box-sizing: border-box; }
* { margin: 0; }
html, body { height: 100%; }
body {
  line-height: var(--leading-normal);
  -webkit-font-smoothing: antialiased;
}
img, picture, video, canvas, svg {
  display: block;
  max-width: 100%;
}
input, button, textarea, select { font: inherit; }
p, h1, h2, h3, h4, h5, h6 { overflow-wrap: break-word; }

:root { color-scheme: light dark; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

### 4.3 Rust color usage rule (load-bearing)

`--brand-support` (#B55239) has a WCAG AA contrast of 4.4:1 on cream — **fails AA normal text** (4.5:1 required) but passes AA large text (3:1) and AA UI components (3:1).

Permitted:
- `background-color` on buttons and filled UI elements
- `color` on text ≥18pt or ≥14pt bold (large headings only)
- `border-color` for dividers and strong UI boundaries
- Icon fill for icons ≥24px

Forbidden:
- Body text `color`, form label `color`, table cell text `color`, any small text (<14pt)

When in doubt, use `--brand-primary` or `--neutral-900` for text.

## 5. Project structure

Full file-by-file layout for the flattened monolithic repo. All paths are relative to the repo root.

```
balikha/
├── scripts/                                  NEW
│   └── migrate.ts                            NEW — standalone migration runner
│
├── src/
│   ├── app/                                  NEW (flattened from frontend/src/app)
│   │   ├── api/                              NEW
│   │   │   └── auth/
│   │   │       └── [...all]/
│   │   │           └── route.ts              NEW — Better Auth catch-all
│   │   ├── (auth)/                           NEW route group
│   │   │   ├── AuthLayout.tsx                NEW
│   │   │   ├── AuthLayout.module.css         NEW
│   │   │   ├── login/
│   │   │   │   ├── page.tsx                  NEW
│   │   │   │   ├── LoginForm.tsx             NEW
│   │   │   │   ├── LoginForm.module.css      NEW
│   │   │   │   └── LoginForm.test.tsx        NEW
│   │   │   └── signup/
│   │   │       ├── page.tsx                  NEW
│   │   │       ├── SignupForm.tsx            NEW
│   │   │       ├── SignupForm.module.css     NEW
│   │   │       └── SignupForm.test.tsx       NEW
│   │   ├── components/                       NEW
│   │   │   ├── LogoutButton.tsx              NEW
│   │   │   ├── LogoutButton.module.css       NEW
│   │   │   └── LogoutButton.test.tsx         NEW
│   │   ├── error.tsx                         NEW
│   │   ├── error.module.css                  NEW
│   │   ├── global-error.tsx                  NEW
│   │   ├── global-error.module.css           NEW
│   │   ├── not-found.tsx                     NEW
│   │   ├── not-found.module.css              NEW
│   │   ├── favicon.ico                       moved from frontend/src/app/
│   │   ├── globals.css                       REWRITE — reset + tokens import
│   │   ├── layout.tsx                        REWRITE — CSS Modules, token order
│   │   ├── layout.module.css                 NEW
│   │   ├── page.tsx                          REWRITE — session-aware home
│   │   └── page.module.css                   NEW
│   │
│   ├── lib/                                  NEW — client-safe utilities + auth
│   │   ├── api/
│   │   │   └── client.ts                     NEW — client fetch helper + ApiFetchError
│   │   ├── auth.ts                           NEW — Better Auth instance (server-only)
│   │   └── auth.test.ts                      NEW — unit test including input:false security guard
│   │
│   ├── server/                               NEW — server-only, 'server-only' imported at top of each file
│   │   ├── config/
│   │   │   ├── env.ts                        NEW — Zod schema, parseEnv, module-level env constant
│   │   │   └── env.test.ts                   NEW
│   │   ├── db/
│   │   │   ├── index.ts                      NEW — pool, db, closePool (test infrastructure)
│   │   │   └── schema.ts                     NEW — Better Auth-generated
│   │   └── lib/
│   │       └── logger.ts                     NEW — pino
│   │
│   ├── styles/                               NEW
│   │   └── tokens.css                        NEW — design tokens (full set, section 4)
│   │
│   └── proxy.ts                              NEW — request ID
│
├── drizzle/                                  populated by db:generate
│   ├── 0000_<name>.sql                       NEW (generated)
│   └── meta/_journal.json                    NEW (generated)
│
├── e2e/                                      moved from repo root e2e/
│   ├── landing.spec.ts                       UPDATE (path refs if any)
│   └── auth.spec.ts                          NEW — signup → session → logout
│
├── docs/
│   └── superpowers/
│       └── specs/
│           ├── 2026-04-12-branch-1-foundations-and-auth-skeleton-design.md          (marked superseded)
│           └── 2026-04-12-branch-1-foundations-and-auth-skeleton-monolithic-design.md (THIS FILE)
│
├── backend/                                  DELETE
├── frontend/                                 DELETE (contents moved to repo root and src/)
│
├── .env.development                          UPDATE — simplified env (4 vars)
├── .env.example                              UPDATE
├── .husky/                                   NEW
│   └── pre-commit                            NEW — lint-staged
├── .nvmrc                                    unchanged (22.14.0)
├── .prettierrc                               NEW
├── CONVENTIONS.md                            NEW
├── docker-compose.yml                        REWRITE — postgres only (minio removed until needed)
├── Dockerfile                                deferred to ops/deployment branch
├── drizzle.config.ts                         moved from backend/, REWRITE with new schema path
├── next.config.ts                            REWRITE — removes rewrites, adds remotePatterns
├── package.json                              REWRITE — single package with all deps
├── playwright.config.ts                      unchanged
├── tsconfig.json                             REWRITE — paths for @/ alias
├── vitest.config.ts                          NEW — single config for all tests
└── app-plan.md                               unchanged
```

### 5.1 Dependencies (single `package.json` at repo root)

**Production:**
- `next@16.2.2`, `react@19.2.4`, `react-dom@19.2.4`
- `better-auth` — auth framework
- `drizzle-orm`, `pg` — database
- `pino` — structured logger
- `zod` — env + future contracts
- `server-only` — build-time guard

**Dev:**
- `drizzle-kit` — migration generation only (not runtime)
- `typescript: ^6.0.x` — the backend's current version. During the flattening commit, verify that Better Auth, Drizzle, eslint-config-next, and @testing-library/react all compile cleanly under TS 6. If any library fails, fall back to `typescript@^5.7.x` and document the incompatibility.
- `@types/node`, `@types/react`, `@types/react-dom`, `@types/pg`
- `eslint`, `eslint-config-next`
- `prettier`
- `vitest`, `@vitest/coverage-v8`
- `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
- `@vitejs/plugin-react`
- `jsdom`
- `tsx` — runs TypeScript scripts (migrate.ts)
- `pino-pretty` — dev pretty logs
- `husky`, `lint-staged`
- `@playwright/test`

**Removed from the old spec's dependency plan:**
- Hono (`hono`, `@hono/node-server`) — no longer used
- `@testcontainers/postgresql` — testing strategy no longer needs it
- `tailwindcss`, `@tailwindcss/postcss` — replaced by CSS Modules
- Separate backend package, separate e2e package — merged into root

### 5.2 TypeScript path alias

`tsconfig.json` defines `@/*` → `./src/*` so imports look like `@/lib/auth`, `@/server/db`, `@/lib/api/client`, `@/app/components/LogoutButton`. Consistent with Next.js conventions.

### 5.3 `drizzle.config.ts`

Lives at the repo root. Required by `drizzle-kit generate` to locate the schema and output directory.

```ts
import { defineConfig } from 'drizzle-kit';
export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

## 6. Server foundation layer

### 6.1 `src/server/config/env.ts` — module-level Zod env

```ts
import 'server-only';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  APP_URL: z.string().url(),
});

export type Env = z.infer<typeof schema>;

export class EnvValidationError extends Error {
  constructor(public readonly details: z.ZodError) {
    super('Invalid environment');
    this.name = 'EnvValidationError';
  }
}

/**
 * Pure function — parses a given env dict and throws on invalid input.
 * Safe to call from tests with arbitrary inputs.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new EnvValidationError(parsed.error);
  }
  return parsed.data;
}

/**
 * Module-level constant — parses process.env at import time.
 * Throws EnvValidationError immediately if env is invalid.
 */
export const env: Env = parseEnv();
```

No `process.exit(1)` at module load — the throw propagates naturally. Tests that exercise env validation call `parseEnv` with explicit inputs and never import `env` directly.

### 6.2 `src/server/lib/logger.ts` — pino

```ts
import 'server-only';
import pino from 'pino';
import { env } from '../config/env.js';

export const logger: pino.Logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'balikha' },
  ...(env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,service',
      },
    },
  }),
});
```

Exports a module-level `logger` singleton. Most callers use `logger` directly.

### 6.3 `src/server/lib/errors.ts` — deferred to branch 2

API error types and helpers are deferred to branch 2 (`feature/marketplace-schema-rbac`), which lands the first custom route handlers. Branch 1 has zero custom routes — Better Auth handles all `/api/` traffic — so error-response infrastructure has no consumer yet.

### 6.4 `src/server/db/index.ts` — pool and db

```ts
import 'server-only';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export const pool: pg.Pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: false,
});

pool.on('error', (err) => {
  logger.error({ err }, 'postgres pool background error');
});

export const db = drizzle(pool);

/**
 * Test-only infrastructure: drains the pool so tests can clean up
 * between runs. Production code never calls this — the process
 * exits naturally. Graceful shutdown is deferred to ops/traefik-deployment.
 */
export async function closePool(): Promise<void> {
  logger.info('closing postgres pool');
  await pool.end();
}
```

Module-level `pool` and `db` constants. `closePool` is exclusively test infrastructure — production code never calls it. The pool does not eagerly connect at import time (`pg.Pool` is lazy), so `next build` succeeds without a reachable database.

### 6.5 `scripts/migrate.ts` — standalone migration runner

```ts
// NOTE: This script runs via `tsx scripts/migrate.ts`, NOT through Next.js.
// It must NOT import 'server-only' or transitively import modules that do,
// because 'server-only' throws on import when loaded outside Next.js's bundler.
// It reads DATABASE_URL directly from process.env.

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL is required for migrations');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: dbUrl });
  const db = drizzle(pool);

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations complete.');

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

**Note:** Before implementing, verify the exact import path for the Drizzle migrator (`drizzle-orm/node-postgres/migrator` vs `drizzle-orm/migrator`) against the pinned drizzle-orm version in `node_modules`. The import path has shifted across Drizzle versions.

Wired into `package.json`:

```json
"scripts": {
  "dev": "npm run db:migrate && next dev",
  "build": "next build",
  "start": "next start",
  "db:migrate": "tsx scripts/migrate.ts",
  "db:generate": "drizzle-kit generate",
  "db:studio": "drizzle-kit studio",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "prepare": "husky"
}
```

`npm run dev` runs migrations first. Idempotent — no-op if already migrated.

### 6.6 Health endpoint (deferred)

**Decision:** there is no `/api/health` endpoint in branch 1.

Rationale: health endpoints exist to tell an external process (Docker healthcheck, Traefik load balancer, monitoring) whether the service is ready. Branch 1 doesn't deploy anywhere — staging/production deployment lands in `ops/traefik-deployment`. Building a health endpoint now would be scaffolding with no consumer.

When `ops/traefik-deployment` lands, it will add `src/app/api/health/live/route.ts` and `src/app/api/health/ready/route.ts` with the same liveness/readiness split from the original spec. The review checklist for that branch will include the 503-on-DB-fail assertion.

This is a scope reduction from the original spec — health endpoints were in branch 1's scope, but they have no runtime consumer until deployment branches exist.

### 6.7 `src/proxy.ts` — request ID

```ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const incoming = request.headers.get('x-request-id');
  // Sanitization filter: reject anything not hex-or-dash, 16-64 chars.
  // Not a UUID validator — just prevents log injection.
  const id =
    incoming && /^[a-f0-9-]{16,64}$/i.test(incoming)
      ? incoming
      : crypto.randomUUID();

  // Mutate the request headers so downstream server components and route
  // handlers can read x-request-id via `(await headers()).get('x-request-id')`.
  // Important: this uses `request: { headers }` (upstream propagation),
  // NOT `headers` at the top level (which would set response headers to the client).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', id);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Also mirror to the response so the browser/client can correlate.
  response.headers.set('x-request-id', id);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

Uses Web Crypto (`crypto.randomUUID()`), which is a global in the Node.js runtime. Tightened regex to `{16,64}` (resolves reviewer Issue 13).

Server components and route handlers can read the request ID via `const requestId = (await headers()).get('x-request-id')` and include it in logging.

## 7. Better Auth integration

### 7.1 Schema generation workflow

**Pin a specific CLI version** (resolves reviewer Issue 4). The implementer must:

1. **Before starting commit 4 (auth), verify and pin the Better Auth CLI version in `package.json`.** Update this spec with the pinned version and verified flags.
2. Pin that version in `package.json` as a devDependency with an exact version (no `^` or `~`), e.g., `"@better-auth/cli": "1.2.3"`.
3. The auth config lives at `src/lib/auth.ts` — a path the Better Auth CLI auto-discovers (it searches `src/lib/auth.ts`). No `--config` flag needed.
4. Commit the pinned CLI version, the generated schema, and the Drizzle migration together.

Sequence:

```bash
# 1. Install Better Auth and pin its CLI
npm install better-auth
npm install -D @better-auth/cli@<pinned-version>

# 2. Author src/lib/auth.ts (section 7.2 below).

# 3. Set the shell env so Better Auth's CLI can resolve any it needs
set -a && source .env.development && set +a

# 4. Run the CLI (auto-discovers src/lib/auth.ts)
npx @better-auth/cli generate --output src/server/db/schema.ts

# 5. Review the generated schema.ts

# 6. Generate the initial Drizzle migration
npm run db:generate

# 7. Review drizzle/0000_*.sql

# 8. Run migrations against the dev DB
npm run db:migrate

# 9. Commit
git add src/lib/auth.ts src/server/db/schema.ts drizzle/ package.json package-lock.json
git commit -m "feat(auth): Better Auth config, schema, initial migration"
```

### 7.2 `src/lib/auth.ts` — full config

```ts
import 'server-only';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/server/db/index.js';
import { env } from '@/server/config/env.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),

  secret: env.AUTH_SECRET,
  baseURL: env.APP_URL,

  emailAndPassword: {
    enabled: true,
    // Email verification requires a transport, deferred to
    // feature/email-verification. Users sign up and are immediately active.
    requireEmailVerification: false,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },

  user: {
    additionalFields: {
      role: {
        type: 'string',
        defaultValue: 'buyer',
        // CRITICAL SECURITY: input: false prevents users from self-assigning
        // admin/seller via the signup payload. Two Vitest tests guard this —
        // do NOT remove either the flag or the tests.
        input: false,
      },
      avatarUrl: {
        type: 'string',
        required: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7,   // 7 days
    updateAge: 60 * 60 * 24,       // rolling refresh if session > 1 day old
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },

  advanced: {
    cookiePrefix: 'balikha',
    useSecureCookies: env.APP_URL.startsWith('https'),
    defaultCookieAttributes: {
      sameSite: 'lax',
      httpOnly: true,
      path: '/',
    },
  },
});
```

Module-level `auth` constant. Constructed at import time from `env` and `db`. Every caller imports `auth` directly.

### 7.3 `src/app/api/auth/[...all]/route.ts` — catch-all handler

```ts
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

export const { GET, POST } = toNextJsHandler(auth);
```

Two lines. That's the entire auth route layer. `toNextJsHandler` is Better Auth's official Next.js integration helper — it wraps the web-standard handler with framework-specific optimizations. Better Auth handles sign-up, sign-in, sign-out, session, password reset (when enabled), social providers (when enabled), and everything else internally.

### 7.4 Expected generated schema

Approximate shape (actual output depends on the pinned CLI version):

```ts
import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  role: text('role').notNull().default('buyer'),
  avatarUrl: text('avatar_url'),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at'),
  updatedAt: timestamp('updated_at'),
});
```

**Load-bearing properties every later branch depends on:**

- `user.id` is **`text`** (nanoid), not uuid. Every FK in future branches must be `text('user_id').references(() => user.id)`.
- Table names are **singular** (`user`, not `users`). No placeholder plural `users` table — this repo never had one under the monolithic layout.
- `user.role` has a default of `'buyer'`. `input: false` enforces that signup payloads can't override it.
- `account.password` holds the bcrypt hash. Never queried or logged directly.

### 7.5 Initial account bootstrap (MVP workaround)

Resolves reviewer Issue 17. Because `input: false` prevents self-assignment of the `role` field during signup, the developer/owner's seller and admin accounts must be promoted via direct SQL after creation:

```bash
# After branch 1 is running locally:

# 1. Sign up the seller account via the UI at http://localhost:3000/signup
#    Email: you+seller@example.com
#    Password: (your seller password)

# 2. Sign up the admin account via the UI (separate browser profile or incognito)
#    Email: you+admin@example.com
#    Password: (your admin password, different)

# 3. Promote both accounts in Postgres:
psql "$DATABASE_URL" <<SQL
UPDATE "user" SET role = 'seller' WHERE email = 'you+seller@example.com';
UPDATE "user" SET role = 'admin'  WHERE email = 'you+admin@example.com';
SQL

# 4. Sign out and sign back in so the new role is reflected in the session.
```

Documented in `CONVENTIONS.md`. A proper seed script lands in `feature/marketplace-schema-rbac`.

### 7.6 Known gap — manual password reset

Until `feature/email-verification` lands, a user who forgets their password cannot recover it through the UI. Workaround:

1. Generate a new password hash with Better Auth's password hashing (out-of-band).
2. Update `account.password` directly in Postgres for the user's row.
3. Invalidate all sessions: `DELETE FROM "session" WHERE "user_id" = ?`.

Acceptable for MVP because the first seller is the developer/owner.

### 7.7 What branch 1 explicitly does NOT ship

| Feature | Why deferred | Target branch |
|---|---|---|
| Email verification | Needs email transport | `feature/email-verification` |
| Password reset | Needs email transport | `feature/email-verification` |
| Google OAuth | Google Console setup | `feature/oauth-google` |
| `requireRole` proxy guard | No protected endpoints yet | `feature/marketplace-schema-rbac` |
| Better Auth `admin()` plugin | Needs RBAC middleware | `feature/marketplace-schema-rbac` |
| Rate limiting | Observability layer | `feature/observability-baseline` |
| Per-request structured logging | Needs AsyncLocalStorage context | `feature/observability-baseline` |
| Account linking | Needs Google OAuth first | `feature/oauth-google` |
| 2FA / MFA | Post-MVP | Not scheduled |
| Session impersonation | Post-MVP admin feature | Not scheduled |
| Health endpoints | No external consumer in branch 1 | `ops/traefik-deployment` |

## 8. Frontend auth flow

### 8.1 Session helper — direct function call

There is no `serverFetch`, no `getSession` wrapper, no cookie forwarding. Server components call Better Auth directly:

```tsx
// src/app/page.tsx (fragment)
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  // session is typed as ReturnType<...> | null by Better Auth
  // ...
}
```

Better Auth handles cookie reading, session validation, and rolling refresh internally. The `Set-Cookie` for a rolled session flows into the Next.js response automatically because Better Auth participates in the same request/response lifecycle — no external HTTP round trip.

This resolves reviewer Issues 1 (Set-Cookie dropped), 9 (manual cookie assembly), 11 (getSession Zod validation — Better Auth's types are already authoritative).

### 8.2 `src/lib/api/client.ts` — client-side fetch helper

Used by client components (login form, signup form, logout button) for calls to `/api/auth/*`. Same-origin, so cookies forward automatically.

```ts
export class ApiFetchError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiFetchError';
  }
}

export async function clientFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({
      error: `HTTP ${response.status}`,
    }));
    throw new ApiFetchError(
      response.status,
      body.error ?? `HTTP ${response.status}`,
      body.code,
      body.requestId,
    );
  }

  return response.json() as Promise<T>;
}
```

Single file. No server-side counterpart. Lives in `src/lib/api/client.ts` (not `src/server/`) because it runs in both server components' client children and client components — it's pure browser code. No `'server-only'` import.

Resolves reviewer Issue 10 (duplicate ApiFetchError classes) — there's only one.

### 8.3 Auth layout (split-screen, 60/40)

Same design as the original spec. `src/app/(auth)/AuthLayout.tsx` wraps login and signup with a 60/40 grid: deep red branding panel on the left with cream text and a gold accent bar, cream form panel on the right. On viewports ≤768px, the layout reflows to stacked (compact branding header above a full-width form). Branding uses semantic markup (not `aria-hidden`) so screen readers get consistent information regardless of viewport.

Placeholder branding copy: title "Balikha", tagline "Artisan marketplace — handcrafted pottery and more", footnote "Built by artisans, for artisans."

Contrast check for the branding panel: cream text (#F6F1E9) on deep red (#8C1C13) is 8.2:1, AAA. Tagline at opacity 0.92 and footnote at 0.7 remain above AA. Gold accent bar is decorative.

### 8.4 Login and signup pages

Both pages are server components that check for an existing session via `auth.api.getSession` and redirect to `/` if authenticated. They wrap their respective client forms (`LoginForm`, `SignupForm`) in `AuthLayout`.

Signup page heading: `Create your account`. Login page heading: `Sign in to Balikha`.

Forms post to `/api/auth/sign-in/email` and `/api/auth/sign-up/email` via `clientFetch`. On success, `router.push('/')` + `router.refresh()` triggers server components to re-render with the new session cookie.

Error handling: form state includes `error: string | null`. On `ApiFetchError`, the form displays the server's error message inside a `role="alert"` element with the danger semantic color.

Password input has `minLength={10}` matching Better Auth's config.

### 8.5 Logout — client component, no dedicated route

`src/app/components/LogoutButton.tsx` is a client component that POSTs to `/api/auth/sign-out` via `clientFetch`, then navigates to `/` and calls `router.refresh()`. On failure, it displays the error inline and lets the user retry. No dedicated `/logout` route exists.

The home page imports `LogoutButton` and renders it next to the user's email when a session exists.

### 8.6 Home page — session-aware, direct auth calls

```tsx
// src/app/page.tsx
import Link from 'next/link';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { LogoutButton } from './components/LogoutButton';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Balikha</h1>
        <p className={styles.tagline}>
          Artisan marketplace — handcrafted pottery and more
        </p>

        {session ? (
          <p className={styles.greeting}>
            Signed in as {session.user.email}. <LogoutButton />
          </p>
        ) : (
          <p className={styles.greeting}>
            <Link href="/login" className={styles.link}>Sign in</Link>
            {' or '}
            <Link href="/signup" className={styles.link}>create an account</Link>
          </p>
        )}
      </main>
    </div>
  );
}
```

No health check card — no `/api/health` endpoint in branch 1. The existing `HealthCheck.tsx` component and its test are deleted during the migration commit.

### 8.7 Error, not-found, and global-error pages

All three use CSS Modules consistent with the rest of the app.

- `error.tsx` — segment error boundary, uses tokens.
- `not-found.tsx` — 404 page, uses tokens.
- `global-error.tsx` — root error boundary. **Per reviewer Issue 8**, this file is marked `'use client'`, renders its own `<html lang="en"><body>...</body></html>` tags, and imports `@/styles/tokens.css` and `./globals.css` directly at the top (not inherited from `layout.tsx`, because `global-error.tsx` replaces the root layout when the root layout itself fails).

**Note:** Next.js 16 prefers `unstable_retry` over `reset` — `unstable_retry` re-fetches in addition to re-rendering, which is more appropriate for transient failures.

```tsx
// src/app/global-error.tsx
'use client';

import '@/styles/tokens.css';
import './globals.css';
import styles from './global-error.module.css';

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body className={styles.body}>
        <main className={styles.container}>
          <h1 className={styles.title}>Something went very wrong</h1>
          <p className={styles.description}>
            The application failed to render. This is usually temporary.
          </p>
          <button type="button" onClick={unstable_retry} className={styles.button}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
```

```tsx
// src/app/error.tsx
'use client';

import styles from './error.module.css';

export default function Error({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Something went wrong</h1>
      <p className={styles.description}>
        An unexpected error occurred. Please try again.
      </p>
      <button type="button" onClick={unstable_retry} className={styles.button}>
        Try again
      </button>
    </main>
  );
}
```

## 9. Environment files

### 9.1 `.env.development` (committed, local Docker Compose)

```env
NODE_ENV=development

# Postgres — local dev
POSTGRES_DB=balikha
POSTGRES_USER=balikha
POSTGRES_PASSWORD=secret
DATABASE_URL=postgresql://balikha:secret@localhost:5432/balikha

# Public URL for Better Auth baseURL
APP_URL=http://localhost:3000

# Better Auth — deterministic dev-only secret (committed; NOT a real secret)
AUTH_SECRET=dev-only-secret-at-least-32-characters-fixed-ok
```

Five lines of actual config. `POSTGRES_*` are used by the compose file to initialize the database; `DATABASE_URL` is what the Next.js app reads.

Note: `DATABASE_URL` uses `localhost:5432` rather than a Docker service name because the Next.js app runs on the host (via `npm run dev`), not inside a container. Postgres is the only container in the dev compose.

### 9.2 `.env.example` (committed, template)

```env
# Template for .env.staging and .env.production (VPS only, chmod 600).
# NEVER commit filled-in .env.staging or .env.production files.

NODE_ENV=production

POSTGRES_DB=balikha
POSTGRES_USER=balikha
POSTGRES_PASSWORD=CHANGE_ME_openssl_rand_base64_32
DATABASE_URL=postgresql://balikha:CHANGE_ME@<db-host>:5432/balikha

APP_URL=https://<domain>

AUTH_SECRET=CHANGE_ME_openssl_rand_base64_64
```

### 9.3 `docker-compose.yml` — postgres only

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - balikha-db-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "${POSTGRES_USER}", "-d", "${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  balikha-db-data:
```

One service. No `backend`, no `frontend`, no `minio` (MinIO lands in `feature/seller-dashboard` when it's actually needed). `docker compose up -d db` starts Postgres; `npm run dev` at repo root starts the Next.js app.

## 10. CONVENTIONS.md contents

The full text that lands at repo root.

```markdown
# Balikha conventions

Rules and patterns that can't easily be enforced by linters but are
load-bearing for the codebase.

## No error swallowing (from CLAUDE.md)

Every try/catch must either re-throw or return a meaningful error to
the caller. Forbidden:

- `catch (e) { return null }` where null looks like success
- `catch (e) { console.error(e) }` with no re-throw
- `catch (e) { logger.error(e) }` with no re-throw

The test: after error handling runs, can the calling code tell something
went wrong? If no, you're swallowing.

Legitimate pattern — discriminated union:
`{ kind: 'ok', data } | { kind: 'error', reason }`. The caller must
handle both cases explicitly.

## No fallback logic (from CLAUDE.md)

Never use default values to mask missing data. `value ?? 'default'`
is forbidden when nil indicates a bug. If data is missing, throw.
Exception: error message fallbacks (`err.message ?? 'Unknown error'`).

## Server-only boundary

Every module in `src/server/` imports `'server-only'` at the top.
`src/lib/auth.ts` also imports `'server-only'` because it is
server-only code (it accesses the database and auth secrets).

    import 'server-only';

If a client component accidentally imports from `@/server/` or
`@/lib/auth`, the build fails at the boundary. This is a physical
guarantee, not a convention.

Exception: `scripts/migrate.ts` and other tooling scripts run via `tsx`
do NOT import `'server-only'` because the package throws when imported
outside Next.js's bundler. Scripts construct their own minimal resources
(pg.Pool, etc.) rather than importing from `src/server/`.

## Server code import direction

Inside `src/server/` and `src/lib/auth.ts`, strict one-way dependency:

`auth` depends on `db`. `db` depends on `config` and `lib`. `lib`
depends on `config`. `config` depends on nothing.

`src/app/` can import from `src/server/` and `src/lib/auth.ts`.
Neither `src/server/` nor `src/lib/auth.ts` can EVER import from
`src/app/`.

## Dynamic rendering

Every page that calls `auth.api.getSession` or otherwise depends on
per-request state must include:

    export const dynamic = 'force-dynamic';

Reason: Next.js 16 is aggressive about static prerendering. Pages that
fetch at build time will fail CI builds that run `next build` without
a database reachable.

## Build offline invariant

Branch 1's `next build` must succeed without a reachable database.
If any module in `src/server/` or `src/lib/auth.ts` tries to connect
to Postgres at import time, it is a bug. Verify by running:

    npm run build

with `DATABASE_URL=postgresql://fake:fake@localhost:1/fake` and
confirming exit 0.

## CSS Modules only

All styling lives in `*.module.css` files colocated with the component.
Reference design tokens via `var(--*)` — never hardcode colors or
spacing values. Tokens are defined once in `src/styles/tokens.css`.

No Tailwind. No utility classes. No static inline styles. Dynamic
values from props/state (a computed width, a user-positioned tooltip)
may use the React `style` prop. Everything else lives in a `*.module.css`
file.

## Design tokens — load order matters

`tokens.css` must be imported BEFORE `globals.css` in `src/app/layout.tsx`:

    import '@/styles/tokens.css';
    import './globals.css';

`src/app/global-error.tsx` imports both directly because it replaces
the root layout when the layout itself fails — it cannot rely on
`layout.tsx`'s imports.

## Rust color usage rule

`--brand-support` (#B55239) has a WCAG contrast of 4.4:1 on cream —
fails AA normal text (4.5:1 required) but passes AA large (3:1) and
AA UI components (3:1).

Permitted:
- `background-color` on buttons and filled UI elements
- `color` on text 18pt+ or 14pt+ bold (large headings only)
- `border-color` for dividers and strong UI boundaries
- Icon fill for icons 24px+

Forbidden:
- Body text `color`
- Form label `color`
- Table cell text `color`
- Any small text (<14pt)

When in doubt, use `--brand-primary` or `--neutral-900` for text.

## Migration strategy — programmatic migrator

Migrations run via `scripts/migrate.ts`, a standalone Node script that
uses `drizzle-orm/migrator`'s `migrate()` function.

    npm run db:migrate   # runs scripts/migrate.ts via tsx

`drizzle-kit` is a devDependency used only for migration generation
(`npm run db:generate`). It is NEVER needed at runtime in production.

## Better Auth — load-bearing details

- `user.id` is `text` (nanoid), NOT uuid. Every FK pointing at the
  user table in future branches must be
  `text('user_id').references(() => user.id)`.
- Table names are singular (`user`, not `users`).
- `additionalFields.role.input = false` MUST stay. Removing it allows
  users to self-assign `role: 'admin'` during signup — trivial
  privilege escalation. Two Vitest tests guard this
  (`src/lib/auth.test.ts`): one via `auth.handler` (HTTP path) and
  one via `auth.api.signUpEmail` (direct API). Do not delete either test.
- Password minimum length is 10 (NIST-style: length over complexity).
- Email verification is DISABLED in MVP (no email transport yet).
- The auth instance is a module-level constant. Import as
  `import { auth } from '@/lib/auth'`.

## Single DB-file rule (test isolation)

Only one test file may use a direct `pg.Pool` connection to the test
database. Currently that file is `src/lib/auth.test.ts`. Additional
DB-touching tests must either be added to that file or wait for
per-worker-schema infrastructure.

## Owner account model (two separate accounts)

The developer/owner uses TWO SEPARATE accounts: one with role='seller'
for shop management, one with role='admin' strictly for administrative
tasks. Rationale: principle of least privilege.

- The admin session never holds seller state.
- The seller session never holds admin capabilities.
- A compromised seller session cannot escalate.

When working on the app as yourself, always use the seller account
unless you're specifically doing admin work.

## Initial account bootstrap (MVP workaround)

Because `input: false` prevents self-assignment of the `role` field
during signup, the owner's seller and admin accounts must be promoted
via direct SQL after creation:

    # After signing up both accounts via the UI:
    psql "$DATABASE_URL" <<SQL
    UPDATE "user" SET role = 'seller' WHERE email = 'you+seller@example.com';
    UPDATE "user" SET role = 'admin'  WHERE email = 'you+admin@example.com';
    SQL

Sign out and back in so the new role appears in the session.

A proper seed script lands in `feature/marketplace-schema-rbac`.

## Manual admin password reset (MVP workaround)

Until `feature/email-verification` lands, forgotten passwords are reset
via direct DB intervention:

1. Generate a new password hash with Better Auth's password hashing.
2. Update `account.password` directly in Postgres for the user's row.
3. Invalidate all sessions:
   `DELETE FROM "session" WHERE "user_id" = ?`

## Logging — don't log secrets

Never log:
- Passwords (even hashed)
- `AUTH_SECRET` or any other env secret
- Session cookies or tokens
- Full request bodies on auth routes

The structured logger (`src/server/lib/logger.ts`) defaults to request
metadata only. If you add route-level logging, keep it to high-level
facts, not payloads.

## Shared API contract strategy

Branch 1 has no custom API endpoints, so no contracts infrastructure
lands here. Branch 2 (`feature/marketplace-schema-rbac`) creates
`packages/contracts/` as an npm workspace and lands the first shared
Zod schemas alongside shops/items/orders CRUD.

When adding a new custom API endpoint (branch 2+):

1. Define the request and response Zod schema in
   `packages/contracts/src/<domain>.ts`
2. Import and use it in the Next.js route handler for validation
3. Import and use it in the frontend form with `@hookform/resolvers/zod`
4. Never duplicate the schema. The contracts package is the single
   source of truth.

Hono RPC (`hc` client) is explicitly NOT used — framework independence
is valued over endpoint URL inference.

## Commit message format

Conventional Commits. One of:

- `feat(scope): description` — new feature
- `fix(scope): description` — bug fix
- `chore(scope): description` — tooling, deps, env
- `docs(scope): description` — documentation
- `test(scope): description` — tests only
- `refactor(scope): description` — refactor without behavior change

Scopes for branch 1: `repo` (flattening), `server`, `app`, `auth`,
`styles`, `e2e`.
```

## 11. Testing strategy

### 11.1 Approach

Three tiers, much simpler than the original spec:

1. **Unit tests (Vitest)** for pure functions — `parseEnv` and isolated component rendering via RTL.
2. **Integration-as-unit tests (Vitest)** for auth — direct function calls against `auth.api.*` and `auth.handler` with a real Postgres. No testcontainers, no mock layer. Tests use a separate test database configured via an env var.
3. **End-to-end (Playwright)** for the full user flow — browser spins up against the running Next.js dev server, exercises signup → session → logout.

Total test file count: ~6 files. Runtime: ~30 seconds for the full suite.

### 11.2 Test database setup

Instead of testcontainers, the test suite assumes a Postgres database named `balikha_test` is available at the same host/port as the dev database. Rationale: the dev Postgres container is already running (`docker compose up -d db`), and creating a second database inside the same instance costs nothing.

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
```

```ts
// vitest.setup.ts

// Mock 'server-only' so Vitest can import modules that use it.
// Vitest is not Next.js's bundler — the 'server-only' package throws
// a build-time error only inside Next.js's webpack/turbopack pipeline.
// The real guard is enforced at `next build` time; this mock lets us
// unit-test server modules in Vitest without that throw.
vi.mock('server-only', () => ({}));

// Minimal env for modules that import `env` transitively during tests.
// DATABASE_URL is NOT set here — only the auth integration test needs it,
// and it sets its own in beforeAll (reading from .env.development or
// using a hardcoded test value).
process.env.NODE_ENV = 'test';
process.env.AUTH_SECRET = 'test-secret-at-least-32-characters-long-ok';
process.env.APP_URL = 'http://localhost:3000';
```

The test database is created once via:

```bash
# One-time setup, documented in README:
psql "postgresql://balikha:secret@localhost:5432/postgres" -c "CREATE DATABASE balikha_test;"
```

### 11.3 Env validation tests (`src/server/config/env.test.ts`)

Tests `parseEnv` directly with varying input dicts. No singleton, no module-load behavior:

- Valid env dict → returns parsed
- Missing `AUTH_SECRET` → throws `EnvValidationError`
- Short `AUTH_SECRET` (<32) → throws
- Malformed `DATABASE_URL` → throws
- Invalid `NODE_ENV` value (e.g., `'staging'`) → throws

~5 tests, all milliseconds, no I/O.

### 11.4 Auth tests (`src/lib/auth.test.ts`) — THE security tests

This file contains the two most important tests in branch 1.

```ts
import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { auth } from './auth.js';

// Uses a test database. Assumes Postgres is running and balikha_test exists.
const TEST_DB_URL = 'postgresql://balikha:secret@localhost:5432/balikha_test';

let testPool: pg.Pool;

beforeAll(async () => {
  process.env.DATABASE_URL = TEST_DB_URL;
  // Run migrations against the test DB
  testPool = new pg.Pool({ connectionString: TEST_DB_URL });
  await migrate(drizzle(testPool), { migrationsFolder: './drizzle' });
});

beforeEach(async () => {
  // Truncate tables for isolation
  await testPool.query('TRUNCATE "user", "session", "account", "verification" CASCADE');
});

afterAll(async () => {
  await testPool.end();
});

describe('Better Auth — signup security', () => {
  // ★ THE PRIMARY SECURITY TEST — HTTP path
  // This exercises the actual attack surface: an HTTP POST to the signup
  // endpoint with role: 'admin' in the JSON body. Uses auth.handler
  // (the same web-standard handler that the catch-all route delegates to).
  it('ignores role in the HTTP signup payload (input: false)', async () => {
    const request = new Request('http://localhost:3000/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'attacker-http@example.com',
        password: 'password-at-least-10-chars',
        name: 'Attacker HTTP',
        role: 'admin',
      }),
    });

    const response = await auth.handler(request);
    expect(response.status).toBeLessThan(400);

    // Verify in the database that the role is 'buyer', NOT 'admin'
    const { rows } = await testPool.query<{ role: string }>(
      'SELECT role FROM "user" WHERE email = $1',
      ['attacker-http@example.com'],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('buyer');
  });

  // ★ DEFENSE-IN-DEPTH — direct API path
  // Belt-and-suspenders: also test via the direct function call API.
  it('ignores role via direct API call (input: false)', async () => {
    const result = await auth.api.signUpEmail({
      body: {
        email: 'attacker-direct@example.com',
        password: 'password-at-least-10-chars',
        name: 'Attacker Direct',
        // @ts-expect-error — deliberately passing a forbidden field
        role: 'admin',
      },
    });
    expect(result).toBeTruthy();

    // Verify in the database that the role is 'buyer', NOT 'admin'
    const { rows } = await testPool.query<{ role: string }>(
      'SELECT role FROM "user" WHERE email = $1',
      ['attacker-direct@example.com'],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('buyer');
  });

  it('enforces minimum password length of 10', async () => {
    await expect(
      auth.api.signUpEmail({
        body: {
          email: 'short@example.com',
          password: 'short',
          name: 'Short Password',
        },
      }),
    ).rejects.toThrow();
  });

  it('creates a user with default role buyer on valid signup', async () => {
    await auth.api.signUpEmail({
      body: {
        email: 'normal@example.com',
        password: 'password-at-least-10-chars',
        name: 'Normal User',
      },
    });

    const { rows } = await testPool.query<{ role: string }>(
      'SELECT role FROM "user" WHERE email = $1',
      ['normal@example.com'],
    );
    expect(rows[0].role).toBe('buyer');
  });
});
```

Key differences from the original spec's testcontainers approach:

- Two security test paths: the HTTP-path test via `auth.handler(new Request(...))` exercises the real attack surface; the direct `auth.api.signUpEmail` test provides defense-in-depth.
- Uses the already-running dev Postgres instance via a separate `balikha_test` database. ~0 startup overhead (compared to testcontainers' 5-10 seconds per file).
- Module-level `auth` constant — no lazy cache reset needed.
- The security tests are the linchpin: if `input: false` is removed, both tests fail in under 100ms.

### 11.5 Frontend RTL tests

- `LoginForm.test.tsx` — renders form, submits credentials, navigates on success, shows error on 401.
- `SignupForm.test.tsx` — similar structure.
- `LogoutButton.test.tsx` — clicks button, verifies fetch call, navigates on success.

Pattern: mock `next/navigation` (`useRouter`) and `@/lib/api/client` (`clientFetch`). Use `@testing-library/user-event` for interactions.

### 11.6 Playwright e2e (`e2e/auth.spec.ts`)

```ts
import { test, expect } from '@playwright/test';

test.describe('auth flow', () => {
  const uniqueEmail = () =>
    `e2e-${Date.now()}-${Math.floor(Math.random() * 10000)}@example.test`;

  test('signup → land on home → session visible → sign out → anonymous', async ({ page }) => {
    const email = uniqueEmail();
    const password = 'test-password-ten-chars';

    await page.goto('/signup');
    await expect(
      page.getByRole('heading', { name: /create your account/i }),
    ).toBeVisible();

    await page.getByLabel('Name').fill('E2E User');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: /create account/i }).click();

    await page.waitForURL('/');
    await expect(page.getByText(/signed in as/i)).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    await page.getByRole('button', { name: /sign out/i }).click();
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });

  test('login with wrong credentials shows error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@example.test');
    await page.getByLabel('Password').fill('wrong-password-ten');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
```

Runs against `npm run dev` (not Docker, since there's no separate app container in dev anymore). Playwright config starts the dev server automatically if not already running.

### 11.7 Running tests

```bash
# Ensure Postgres is running
docker compose up -d db

# Create the test database (one-time)
psql "postgresql://balikha:secret@localhost:5432/postgres" -c "CREATE DATABASE balikha_test;"

# Run unit + integration tests (Vitest)
npm test

# Run e2e (Playwright)
npm run test:e2e
```

### 11.8 NOT in scope for branch 1 tests

- Coverage thresholds
- Mutation testing
- Visual regression
- Load testing
- CI pipeline wiring

## 12. Commit plan

Six commits. Each builds and tests green independently.

| # | Commit | Purpose |
|---|---|---|
| 1 | `docs: add CONVENTIONS.md and branch 1 design spec references` | CONVENTIONS.md lands first so the reviewer has rules before seeing code; old spec's frontmatter updated to `status: superseded`. |
| 2 | `refactor(repo): flatten to monolithic Next.js with CSS Modules and design tokens` | Delete `backend/`, move `frontend/src/*` to `src/*`, consolidate `package.json`, update `tsconfig.json` paths, update `next.config.ts`, update `playwright.config.ts`. Remove Tailwind deps + postcss config, add `src/styles/tokens.css`, rewrite `globals.css`, `layout.tsx`, `page.tsx`, delete `HealthCheck.tsx`. Add error/not-found/global-error pages with CSS Modules. Must pass `npm run build`. |
| 3 | `feat(server): foundation layer — env, logger, db, proxy, prettier, husky` | Add `src/server/{config,lib,db}/`, `src/proxy.ts`, `.prettierrc`, `.husky/pre-commit`, `drizzle.config.ts`, updated `.env.development`, migrate script at `scripts/migrate.ts`, plus unit tests for env. Dev tooling is folded into this commit because it's small and touches package.json the same way as the server foundation. |
| 4 | `feat(auth): Better Auth config, schema, migration, catch-all handler, security tests` | Install `better-auth`, write `src/lib/auth.ts`, run CLI to generate `src/server/db/schema.ts`, run `db:generate` for initial migration in `drizzle/`, add `src/app/api/auth/[...all]/route.ts`, add `src/lib/auth.test.ts` with both the HTTP-path and direct-API `input: false` security tests. |
| 5 | `feat(app): auth UI — layout, login, signup, logout button, session-aware home` | AuthLayout + login + signup + LogoutButton + RTL tests, rewrite `page.tsx` to show session. |
| 6 | `test(e2e): auth flow spec` | `e2e/auth.spec.ts` with signup→home→logout happy path and wrong-password negative test. |

Six commits. Each is self-contained and independently green.

## 13. Review checklist (what `/claude-review-against-plan` verifies)

### Structural
- [ ] `backend/` directory is deleted
- [ ] `frontend/` directory is deleted
- [ ] Repo root contains `src/app/`, `src/server/`, `src/styles/`, `src/lib/`, `src/proxy.ts`
- [ ] `scripts/migrate.ts` exists
- [ ] `tsconfig.json` defines `@/*` → `./src/*` path alias
- [ ] `frontend/postcss.config.mjs` no longer exists
- [ ] `tailwindcss` and `@tailwindcss/postcss` are NOT in `package.json`
- [ ] `hono` and `@hono/node-server` are NOT in `package.json`
- [ ] `@testcontainers/postgresql` is NOT in `package.json`
- [ ] `src/server/db/schema.ts` contains Better Auth-generated tables (`user`, `session`, `account`, `verification`)
- [ ] `drizzle/0000_*.sql` exists and applies cleanly
- [ ] `CONVENTIONS.md` exists at repo root with all sections from section 10
- [ ] `src/styles/tokens.css` contains the full token set from section 4
- [ ] `.env.development` has exactly `NODE_ENV`, `POSTGRES_*`, `DATABASE_URL`, `APP_URL`, `AUTH_SECRET` (5 vars + 3 postgres vars)
- [ ] `docker-compose.yml` has only the `db` service, no backend/frontend/minio
- [ ] The old spec `2026-04-12-branch-1-foundations-and-auth-skeleton-design.md` has `status: superseded` in frontmatter
- [ ] `drizzle.config.ts` at repo root points `schema` at `./src/server/db/schema.ts` and `out` at `./drizzle`

### Behavior
- [ ] `parseEnv` throws on missing `AUTH_SECRET`
- [ ] `parseEnv` throws on `AUTH_SECRET` shorter than 32 chars
- [ ] `env` module-level constant is available after import (throws at import if invalid)
- [ ] Better Auth config has `additionalFields.role.input = false`
- [ ] Better Auth config has `minPasswordLength: 10`
- [ ] `src/lib/auth.test.ts` contains both the HTTP-path and direct-API `input: false` security tests with comments flagging them as non-deletable
- [ ] The HTTP-path security test calls `auth.handler(new Request(...))` with `role: 'admin'` and asserts `role = 'buyer'` in the DB
- [ ] The direct-API security test calls `auth.api.signUpEmail` with `role: 'admin'` and asserts `role = 'buyer'` in the DB
- [ ] `src/app/api/auth/[...all]/route.ts` exports GET and POST via `toNextJsHandler(auth)`
- [ ] `src/proxy.ts` sanitizes incoming `x-request-id` with the tightened regex `{16,64}`
- [ ] `src/app/global-error.tsx` is marked `'use client'`, renders its own `<html>` and `<body>`, imports `tokens.css` and `globals.css` directly, and uses `unstable_retry`
- [ ] `src/app/error.tsx` uses `unstable_retry` instead of `reset`
- [ ] Every page that calls `auth.api.getSession` has `export const dynamic = 'force-dynamic'`
- [ ] `npm run build` succeeds with a deliberately wrong `DATABASE_URL` (e.g., `DATABASE_URL=postgresql://fake:fake@localhost:1/fake`)
- [ ] `npm run build` completes without TS errors; if typescript is ^6, Better Auth/Drizzle/eslint-config-next compatibility has been verified
- [ ] The migrate script's drizzle import path has been verified against `node_modules` and `tsx scripts/migrate.ts` exits 0
- [ ] `@better-auth/cli` is pinned to an exact version (no `^` or `~`) in `package.json`
- [ ] `grep -rn 'new pg.Pool' src/` returns at most one test file

### Scope guards (no creep)
- [ ] No `src/app/api/` route handlers other than the Better Auth catch-all
- [ ] No Google OAuth in auth config
- [ ] No `admin()` plugin
- [ ] No `requireRole` proxy file
- [ ] No rate limiting proxy logic
- [ ] No Sentry integration
- [ ] No per-request structured logging beyond ad-hoc logging in routes
- [ ] No marketplace tables (`shops`, `items`, `orders`, `order_items`)
- [ ] No email transport
- [ ] No `packages/contracts/` workspace
- [ ] No `/api/health` route handler (deferred to `ops/traefik-deployment`)
- [ ] No Hono imports anywhere
- [ ] No `src/server/lib/errors.ts` (deferred to branch 2)

### Convention guards
- [ ] No `color: var(--brand-support)` on elements smaller than 14pt
- [ ] Every file in `src/server/` starts with `import 'server-only';`
- [ ] `src/lib/auth.ts` starts with `import 'server-only';`
- [ ] `scripts/migrate.ts` does NOT import `'server-only'` and does NOT import from `src/server/`
- [ ] No bare `fetch()` to external URLs in server components (Better Auth handles auth via direct function calls; branch 1 has no other outbound HTTP)
- [ ] `src/app/` code never imports from `src/server/` via relative paths — always via `@/server/*`
- [ ] No `catch (e) { return null }` patterns
- [ ] Every `.tsx` in `src/app/` with local styles has a sibling `.module.css` (no static inline styles beyond genuine runtime-computed values)
- [ ] grep guards: `@import "tailwindcss"` returns nothing, `@theme` returns nothing, no Tailwind utility class patterns in `className` strings (resolves reviewer Issue 20)

### Tests exist
- [ ] `src/server/config/env.test.ts` with at least 5 cases from section 11.3
- [ ] `src/lib/auth.test.ts` with the four tests from section 11.4 (including both `input: false` security tests)
- [ ] `src/app/(auth)/login/LoginForm.test.tsx`
- [ ] `src/app/(auth)/signup/SignupForm.test.tsx`
- [ ] `src/app/components/LogoutButton.test.tsx`
- [ ] `e2e/auth.spec.ts`

## 14. Out of scope for branch 1 (explicit deferrals)

- **Google OAuth** — `feature/oauth-google`
- **Email verification and password reset** — `feature/email-verification`
- **RBAC middleware (`requireRole`) and Better Auth admin plugin** — `feature/marketplace-schema-rbac`
- **`shops`, `items`, `orders`, `order_items` tables** — `feature/marketplace-schema-rbac`
- **Admin dashboard scaffold** — `feature/marketplace-schema-rbac`
- **Admin dashboard content** — `feature/admin-dashboard-core`, `feature/admin-dashboard-metrics`
- **Structured error monitoring (Sentry)** — `feature/observability-baseline`
- **Rate limiting and per-request structured logging** — `feature/observability-baseline`
- **Content-Security-Policy configuration** — `feature/observability-baseline`
- **Shared contracts package (`packages/contracts/`)** — `feature/marketplace-schema-rbac`
- **Health endpoints (`/live`, `/ready`)** — `ops/traefik-deployment`
- **Graceful shutdown** — `ops/traefik-deployment` (requires `NEXT_MANUAL_SIG_HANDLE=true` or a custom server wrapper; not worth the complexity in branch 1)
- **API error types and helpers (`errors.ts`)** — `feature/marketplace-schema-rbac` (no custom routes in branch 1 to consume them)
- **File upload endpoint and MinIO client** — `feature/seller-dashboard`
- **PayMongo integration and webhook** — `feature/checkout-paymongo`
- **CI/CD pipeline (GitHub Actions)** — `ops/ci-cd-pipeline`
- **Dockerfile for the Next.js app (production image)** — `ops/traefik-deployment`
- **Traefik reverse proxy and compose files for staging/production** — `ops/traefik-deployment`
- **Backup and disaster recovery scripts** — `ops/backup-dr`
- **Legal pages** — `docs/legal-baseline`
- **i18n scaffolding** — future
- **2FA / MFA for admin accounts** — post-MVP
- **Session impersonation** — post-MVP

## 15. Open questions flagged for future branches

None block branch 1, but each should be resolved before the relevant later branch starts.

- **Email transport choice** (Resend, Postmark, SES, SMTP) — `feature/email-verification`.
- **Component library layer** for richer primitives — `feature/seller-dashboard`.
- **TanStack Table and Recharts** — admin dashboard branches.
- **Database seed script for dev fixtures** — `feature/marketplace-schema-rbac`.
- **Audit log schema shape** — `feature/marketplace-schema-rbac`.
- **Soft delete strategy** — `feature/marketplace-schema-rbac`.
- **Pagination shape** — `feature/public-catalog`.
- **Postgres ICU collation for Filipino text** — `feature/marketplace-schema-rbac`.

## 16. Done criteria

Branch 1 is complete when:

1. All 6 commits from section 12 are on the `feature/foundations-and-auth-skeleton` branch.
2. `npm test` passes (env unit + auth security + RTL).
3. `npm run test:e2e` passes (Playwright against `npm run dev`).
4. Running `docker compose up -d db && npm run dev` brings up the app, the home page renders, and a user can sign up → see session on home → sign out.
5. Both `input: false` security tests are present in `src/lib/auth.test.ts` and pass.
6. `/claude-review-against-plan` passes all checks in section 13.
7. No Hono imports, no Tailwind files, no `src/app/api/` route handlers besides the Better Auth catch-all, no out-of-scope features from section 14.
8. The old spec at `docs/superpowers/specs/2026-04-12-branch-1-foundations-and-auth-skeleton-design.md` has its frontmatter updated to `status: superseded`.
9. The branch is mergeable to `main` (no conflicts, passing checks).

After merging, implementation moves to branch 2 (`feature/marketplace-schema-rbac`) with its own spec, plan, and review cycle.
