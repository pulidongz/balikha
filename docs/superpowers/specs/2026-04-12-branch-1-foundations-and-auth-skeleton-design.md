---
title: "Branch 1 — Foundations and Auth Skeleton (Split-Service, SUPERSEDED)"
date: 2026-04-12
branch: feature/foundations-and-auth-skeleton
parent_plan: /app-plan.md
status: superseded
superseded_by: /Users/pul/Projects/Others/Claude Project Plans/gpul-pottery/balikha/docs/superpowers/specs/2026-04-12-branch-1-foundations-and-auth-skeleton-monolithic-design.md
superseded_reason: "Principal-engineer review surfaced multiple correctness issues rooted in the split-service architecture (cookie forwarding, testcontainers ordering, module-load env validation, dev-compose migration gap, and more). After brainstorming alternatives, the user chose to collapse to a monolithic Next.js architecture. See the new spec for the full redesign. This file is preserved as historical context for the reasoning that led to the pivot."
related_review: /Users/pul/.claude/plans/app-plan-plan-review-round-1.md
---

> **SUPERSEDED.** This spec described a split-service architecture (Hono backend + Next.js frontend talking through `rewrites()`). A principal-engineer review identified multiple correctness issues rooted in the split-service design, and the architecture was collapsed to a monolithic Next.js application. The active spec is at `2026-04-12-branch-1-foundations-and-auth-skeleton-monolithic-design.md`. This file is kept as historical context.

# Balikha — Branch 1: Foundations and Auth Skeleton

## 1. Overview

This is the first feature branch of the Balikha marketplace. It establishes the foundational layer every subsequent branch depends on — environment validation, structured logging, error handling, security headers, graceful shutdown, CSS Modules styling with design tokens, error pages, the server-side API client, and Better Auth with email and password authentication.

It does **not** ship any marketplace features. There are no shops, items, orders, seller dashboards, or admin UIs beyond what auth itself requires. The branch ends when a user can sign up, sign in, see their session on the home page, and sign out.

### Why this scope

`app-plan.md` is too large for a single implementation pass. It is being decomposed into per-phase feature branches, each with its own sub-spec, implementation plan, and `/claude-review-against-plan` pass. Branch 1 is the largest of the foundation-layer branches because it establishes both the cross-cutting backend and frontend scaffolding *and* the first working feature (auth). Subsequent branches are narrower because this one does the heavy setup work once.

### Parent plan alignment

This spec implements Step 0.5 (migration baseline) and most of Step 1 (auth) from `app-plan.md`. Google OAuth, RBAC middleware, the admin plugin, rate limiting, and Sentry are explicitly deferred to later branches per the decomposition discussed during brainstorming.

## 2. Locked decisions

### 2.1 Environment variable shape

- Backend uses a single `NODE_ENV` variable with canonical Node values (`development | production | test`). No separate `APP_ENV`. Staging sets `NODE_ENV=production` so React/library optimizations work correctly.
- Env variable `API_URL` is renamed to `API_URL_INTERNAL` (internal Docker service name, used by Next.js `rewrites()` and the server-side API client). New variable `APP_PUBLIC_URL` holds the public HTTPS URL used by Better Auth `baseURL`, future OAuth callbacks, and canonical URLs.
- Files are named `.env.development`, `.env.staging`, `.env.production` (renamed from `.env.preprod`). Compose files follow the same convention: `docker-compose.production.yml` instead of `docker-compose.preprod.yml`. The rename lands in later branches; branch 1 only touches `.env.development` and `.env.example`.

### 2.2 Styling approach

- **CSS Modules only** with CSS custom properties for design tokens. Tailwind is removed from the repo in this branch.
- No runtime CSS-in-JS. No static inline styles. Dynamic values (computed at runtime from props/state — e.g. a progress bar width, a user-positioned tooltip) may use the React `style` prop; everything else lives in a `*.module.css` file.
- Design tokens live in `frontend/src/styles/tokens.css` and are imported before `globals.css` in `layout.tsx`.

### 2.3 Brand palette (approved)

- **Primary** — Deep Red `#8C1C13` (CTAs, brand headers) — 8.2:1 on cream, AAA.
- **Secondary** — Black `#1C1C1C` (strong text, icons) — 15.3:1, AAA.
- **Accent** — Gold `#D4A373` (**decorative only** — backgrounds, borders, badges) — 2.0:1 on cream, fails text standards.
- **Accent (text)** — Dark gold `#7A5C0D` (text-safe gold companion) — 5.55:1, AA normal.
- **Background** — Cream `#F6F1E9` (page surface).
- **Support** — Rust `#B55239` (original, kept unchanged). 4.4:1 on cream — **usage restricted**: only button backgrounds, large headings (18pt+ or 14pt bold+), borders, and large icons. Never body text.

Dark mode uses warm chocolate `#1F1612` as the page surface with brightened brand color variants (primary `#C8453A`, accent `#E6BC8A`, support `#D4654A`). Full token set in section 4.

### 2.4 Auth configuration

- **Email and password only** in branch 1. No Google OAuth (deferred to `feature/oauth-google`).
- **Email verification disabled** (`requireEmailVerification: false`). Requires an email transport which is deferred to `feature/email-verification`. Password reset is similarly deferred. Manual admin password reset is documented as a workaround.
- **Password minimum length**: 10 characters. No complexity requirements (NIST-style: length over complexity).
- **Session defaults from Better Auth**: 7-day expiration with 1-day rolling refresh. In-memory cookie cache enabled for 5 minutes.
- **Additional fields** on the Better Auth `user` table: `role` (string, default `'buyer'`, `input: false`) and `avatarUrl` (optional string). The `input: false` flag on `role` is critical for security — it prevents users from self-assigning `role: 'admin'` during signup. A vitest integration test guards this and must not be deleted.

### 2.5 Owner account model (two separate accounts)

The developer/owner uses **two separate accounts**: one with `role='seller'` for all shop-management and merchant work, and one with `role='admin'` strictly for administrative tasks. Rationale: principle of least privilege. The admin session never holds seller state, and the seller session never holds admin capabilities. Documented as a rule in `CONVENTIONS.md`.

### 2.6 Shared API contract strategy — deferred to branch 2

Branch 1 has zero custom (non-Better-Auth) API endpoints, so there is nothing to contract against. `CONVENTIONS.md` commits to using **Shared Zod schemas in a `packages/contracts/` workspace** for branch 2 and later. The workspace itself is created in `feature/marketplace-schema-rbac` alongside the first CRUD endpoints. No workspace config lands in branch 1.

### 2.7 Implementation isolation — worktree

Implementation work happens in an isolated git worktree created via `superpowers:using-git-worktrees`. The main working directory stays clean. The spec itself (this file) is committed to `main` first; implementation then happens in the worktree against a fresh branch.

### 2.8 Drizzle migration strategy — Option A

Migrations run via `npx drizzle-kit migrate` in `backend/entrypoint.sh` at container startup. `drizzle-kit` is kept in the runtime image because the existing multi-stage Dockerfile copies `node_modules` from the builder stage (which runs `npm ci` without `--omit=dev`). Staging and production each run a single backend container — multi-container scale-out would require an init container or leader lock, which is out of scope for the MVP.

## 3. Architecture

### 3.1 Service topology (unchanged from app-plan.md)

```
┌─────────┐    HTTPS    ┌──────────┐   rewrites   ┌─────────┐
│ Browser │ ──────────► │ Next.js  │ ───────────► │  Hono   │
└─────────┘             │(frontend)│              │(backend)│
                        └──────────┘              └────┬────┘
                                                       │
                                                 ┌─────┴─────┐
                                                 │ Postgres  │
                                                 └───────────┘
```

The browser only talks to Next.js. Next.js `rewrites()` proxies `/api/*` to the Hono backend over the internal Docker network. The backend is never exposed to the internet directly. MinIO exists in the compose stack but branch 1 does not touch it.

### 3.2 The three fetch contexts

A hidden complexity of this architecture: there are **three distinct fetch contexts** and each handles cookies and URLs differently.

1. **Server component → backend** — server components run on the Next.js server. They see incoming cookies via `next/headers` but must *explicitly forward them* on outbound fetches. Bare `fetch()` silently loses authentication. Branch 1 introduces `frontend/src/lib/api/server.ts` which wraps `fetch` to read and forward cookies plus the request ID.

2. **Client component → backend** — client components run in the browser. Fetches to relative `/api/*` paths go through the Next.js rewrites proxy, cookies forward automatically because the browser sees them as same-origin. Branch 1 introduces `frontend/src/lib/api/client.ts` for this purpose.

3. **Route handlers / server actions** — not used in this repo. Branch 1 has zero `app/api/` route handlers. The "no app/api" invariant is enforced by the architecture; any future branch that finds it needs a route handler must stop and discuss.

### 3.3 Backend layer structure and import direction

```
routes ────────┐
   │           │
   ▼           ▼
middleware ── auth
   │           │
   ▼           ▼
  lib ─────── db
   │           │
   ▼           ▼
  config ─────┘
     │
     ▼
  (nothing)
```

Strict one-way dependency graph. No layer depends on anything above it. `config` depends on nothing, `lib` depends on `config`, `db` depends on `config`, `auth` depends on `db` and `config`, `middleware` depends on `lib` and `config`, `routes` depend on everything below. Read bottom-up; nothing upstream will surprise you. This makes the "no error swallowing" and "no fallback logic" rules enforceable by reading one file at a time.

### 3.4 Request flow (branch 1 shape)

```
Request
  ↓
requestId middleware     → c.set('requestId', uuid); header echoed
  ↓
requestLogger middleware → pino structured log per request
  ↓
secureHeaders            → CSP, HSTS, X-Frame-Options, etc.
  ↓
CORS                     → allowlist from env.CORS_ORIGINS
  ↓
/api/auth/* matched      → Better Auth handler (c.req.raw → Response)
/api/health/* matched    → health routes
  ↓
onError global handler   → catches throws, logs with requestId, returns ApiErrorBody
  ↓
notFound handler         → 404 with ApiErrorBody shape
```

Every response — success or error — carries an `X-Request-Id` header. Every error response body includes the same `requestId` so a user can quote it to support.

## 4. Design tokens and styling system

### 4.1 Full `tokens.css`

Lives at `frontend/src/styles/tokens.css`. Loaded before `globals.css` in `layout.tsx`. All `*.module.css` files in the app reference these via `var(--*)`.

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
  --neutral-50:  #FBF8F2;   /* raised surface (cards, panels) */
  --neutral-100: #F6F1E9;   /* = brand-bg, page surface */
  --neutral-200: #ECE4D4;   /* sunken surface (inputs, zebra rows) */
  --neutral-300: #D9CDB5;   /* default border */
  --neutral-500: #8A7F6A;   /* tertiary text */
  --neutral-700: #4A4437;   /* secondary text */
  --neutral-900: #1C1C1C;   /* = brand-secondary, primary text */

  /* ──────────────────────────────────────────────
     SEMANTIC LAYER — all distinct from brand red
     ────────────────────────────────────────────── */
  --color-success:     #2E7D4F;
  --color-success-bg:  #E6F2EA;
  --color-warning:     #9B6A0A;
  --color-warning-bg:  #FBF4E3;
  --color-danger:      #C62828;   /* bright red, distinct from brand-primary */
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
     SPACING — 4px base, T-shirt scale
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

  /* ──────────────────────────────────────────────
     RADIUS
     ────────────────────────────────────────────── */
  --radius-sm:   0.25rem;
  --radius-md:   0.5rem;
  --radius-lg:   0.75rem;
  --radius-xl:   1rem;
  --radius-full: 9999px;

  /* ──────────────────────────────────────────────
     SHADOWS — warm-tinted, subtle
     ────────────────────────────────────────────── */
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

  /* ──────────────────────────────────────────────
     Z-INDEX scale
     ────────────────────────────────────────────── */
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
/* Modern CSS reset (Josh Comeau style, trimmed) */
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

`--brand-support` (#B55239) has a WCAG AA contrast of 4.4:1 on `--brand-bg` which **fails AA normal text** (4.5:1 required) but passes AA large text (3:1) and AA UI components (3:1).

Permitted:
- `background-color` on buttons and filled UI elements
- `color` on text ≥18pt, or ≥14pt bold (large headings only)
- `border-color` for dividers and strong UI boundaries
- Icon fill for icons ≥24px

Forbidden:
- Body text `color`
- Form label `color`
- Table cell text `color`
- Any small text (<14pt)

When in doubt, use `--brand-primary` or `--neutral-900` for text.

## 5. Project structure

Full file-by-file diff. `NEW` = created, `REWRITE` = rewritten in place, `DELETE` = removed, `UPDATE` = small edits.

```
balikha/
├── backend/
│   ├── src/
│   │   ├── app.ts                               REWRITE
│   │   ├── index.ts                             REWRITE
│   │   ├── config/                              NEW
│   │   │   ├── env.ts                           NEW
│   │   │   └── env.test.ts                      NEW
│   │   ├── db/
│   │   │   ├── index.ts                         REWRITE
│   │   │   └── schema.ts                        REWRITE (generated by Better Auth CLI)
│   │   ├── auth/                                NEW
│   │   │   ├── index.ts                         NEW
│   │   │   └── auth.integration.test.ts         NEW
│   │   ├── lib/                                 NEW
│   │   │   ├── errors.ts                        NEW
│   │   │   └── logger.ts                        NEW
│   │   ├── middleware/                          NEW
│   │   │   ├── requestId.ts                     NEW
│   │   │   └── logger.ts                        NEW
│   │   └── routes/
│   │       ├── health.ts                        REWRITE
│   │       └── health.test.ts                   REWRITE
│   ├── drizzle/                                 populated by db:generate
│   │   ├── 0000_<name>.sql                      NEW (generated)
│   │   └── meta/_journal.json                   NEW (generated)
│   ├── drizzle.config.ts                        unchanged
│   ├── entrypoint.sh                            unchanged
│   ├── Dockerfile                               UPDATE (comment near runner stage)
│   ├── package.json                             UPDATE (add better-auth, pino, pino-pretty, zod, @testcontainers/postgresql)
│   ├── vitest.config.ts                         UPDATE (add setupFiles)
│   ├── vitest.setup.ts                          NEW (test env defaults)
│   └── tsconfig.json                            unchanged
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── (auth)/                          NEW route group
│   │   │   │   ├── AuthLayout.tsx               NEW
│   │   │   │   ├── AuthLayout.module.css        NEW
│   │   │   │   ├── login/
│   │   │   │   │   ├── page.tsx                 NEW
│   │   │   │   │   ├── LoginForm.tsx            NEW
│   │   │   │   │   ├── LoginForm.module.css     NEW
│   │   │   │   │   └── LoginForm.test.tsx       NEW
│   │   │   │   └── signup/
│   │   │   │       ├── page.tsx                 NEW
│   │   │   │       ├── SignupForm.tsx           NEW
│   │   │   │       ├── SignupForm.module.css    NEW
│   │   │   │       └── SignupForm.test.tsx      NEW
│   │   │   ├── components/
│   │   │   │   ├── HealthCheck.tsx              REWRITE (CSS Modules)
│   │   │   │   ├── HealthCheck.module.css       NEW
│   │   │   │   ├── HealthCheck.test.tsx         unchanged
│   │   │   │   ├── LogoutButton.tsx             NEW
│   │   │   │   ├── LogoutButton.module.css      NEW
│   │   │   │   └── LogoutButton.test.tsx        NEW
│   │   │   ├── error.tsx                        NEW
│   │   │   ├── error.module.css                 NEW
│   │   │   ├── global-error.tsx                 NEW
│   │   │   ├── global-error.module.css          NEW
│   │   │   ├── not-found.tsx                    NEW
│   │   │   ├── not-found.module.css             NEW
│   │   │   ├── favicon.ico                      unchanged
│   │   │   ├── globals.css                      REWRITE
│   │   │   ├── layout.tsx                       REWRITE (CSS Modules, token import order)
│   │   │   ├── layout.module.css                NEW
│   │   │   ├── page.tsx                         REWRITE (server API client + session-aware)
│   │   │   └── page.module.css                  NEW
│   │   ├── lib/                                 NEW
│   │   │   ├── api/
│   │   │   │   ├── server.ts                    NEW (SSR fetch client, cookie forwarding)
│   │   │   │   └── client.ts                    NEW (browser fetch helpers)
│   │   │   ├── auth/
│   │   │   │   └── session.ts                   NEW (getSession helper)
│   │   │   └── config/
│   │   │       └── env.server.ts                NEW (zod env validation, server-only)
│   │   └── styles/                              NEW
│   │       └── tokens.css                       NEW
│   ├── next.config.ts                           REWRITE (API_URL_INTERNAL + remotePatterns)
│   ├── Dockerfile                               UPDATE (ARG for API_URL_INTERNAL at build time)
│   ├── package.json                             UPDATE (add zod, server-only; remove tailwindcss, @tailwindcss/postcss)
│   ├── postcss.config.mjs                       DELETE
│   └── tsconfig.json                            unchanged
│
├── e2e/
│   ├── landing.spec.ts                          unchanged
│   └── auth.spec.ts                             NEW (signup → session → logout flow)
│
├── docker-compose.yml                           unchanged (service names unchanged in branch 1)
├── .env.development                             UPDATE (rename + AUTH_SECRET + APP_PUBLIC_URL)
├── .env.example                                 UPDATE (match .env.development template)
├── .prettierrc                                  NEW
├── .husky/                                      NEW
│   └── pre-commit                               NEW (runs lint-staged)
├── package.json                                 UPDATE (add husky, lint-staged, "prepare" script)
├── CONVENTIONS.md                               NEW
└── playwright.config.ts                         unchanged
```

### 5.1 Dependencies

**Backend — add:**
- `better-auth` — auth framework
- `pino` — structured logger
- `pino-pretty` (dev) — dev log pretty-printing
- `zod` — env validation + future contracts
- `@testcontainers/postgresql` (dev) — integration test DB

**Frontend — add:**
- `zod` — env validation + form schemas
- `server-only` — build-time guard for server-only modules

**Frontend — remove:**
- `tailwindcss`
- `@tailwindcss/postcss`

**Root — add:**
- `husky` (dev) — pre-commit hook runner
- `lint-staged` (dev) — run linters on staged files only

### 5.2 Import direction (backend)

Enforced by convention, documented in `CONVENTIONS.md`, spot-checked in review:

```
routes → lib, middleware, db, auth
middleware → lib, config
auth → db, config
db → config
lib → config
config → (nothing)
```

No layer depends on anything above it.

## 6. Backend foundation layer

### 6.1 `backend/src/config/env.ts` — Zod-validated env with testable parse function

```ts
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']),
  PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().url(),
  MINIO_ENDPOINT: z.string().url(),
  MINIO_ACCESS_KEY: z.string().min(1),
  MINIO_SECRET_KEY: z.string().min(1),
  MINIO_BUCKET: z.string().min(1),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  APP_PUBLIC_URL: z.string().url(),
  CORS_ORIGINS: z.string().min(1),
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
 * Safe to call from tests; tests should import this directly, not the
 * module-level `env` singleton.
 */
export function parseEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new EnvValidationError(parsed.error);
  }
  return parsed.data;
}

/**
 * Module singleton — parse real process.env at boot, exit on failure.
 */
function loadEnvOrExit(): Env {
  try {
    return parseEnv();
  } catch (err) {
    if (err instanceof EnvValidationError) {
      console.error('❌ Invalid environment variables:');
      console.error(err.details.format());
      process.exit(1);
    }
    throw err;
  }
}

export const env = loadEnvOrExit();
```

Key points:
- `parseEnv` is a pure function testable in isolation.
- The module-level singleton calls `parseEnv` and exits on failure — production boot behavior.
- `CORS_ORIGINS` is a comma-separated string, split in `app.ts`.
- `PORT` coerces from string (env vars are always strings) with a sensible default. The default is not a "fallback" in the CLAUDE.md sense because PORT is genuinely optional and the default is explicit.

### 6.2 `backend/src/lib/logger.ts` — pino

```ts
import pino from 'pino';
import { env } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'production' ? 'info' : 'debug',
  base: { service: 'balikha-backend' },
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

- JSON logs in production (Docker captures them for aggregation later).
- Pretty logs in development for human readability.
- Every log line auto-includes `service: 'balikha-backend'`.

### 6.3 `backend/src/middleware/requestId.ts`

```ts
import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';

export const requestId: MiddlewareHandler = async (c, next) => {
  const incoming = c.req.header('X-Request-Id');
  const id = incoming && /^[a-f0-9-]{8,64}$/i.test(incoming) ? incoming : randomUUID();
  c.set('requestId', id);
  c.header('X-Request-Id', id);
  await next();
};
```

- Honors an incoming `X-Request-Id` if it passes a safety regex. Lets Traefik propagate request IDs through a future load balancer.
- Always echoes the ID in the response header so browser devtools can match to backend logs.

### 6.4 `backend/src/middleware/logger.ts`

```ts
import type { MiddlewareHandler } from 'hono';
import { logger } from '../lib/logger.js';

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const requestId = c.get('requestId');

  await next();

  const durationMs = Date.now() - start;
  const status = c.res.status;
  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

  logger[level]({
    requestId,
    method: c.req.method,
    path: c.req.path,
    status,
    durationMs,
  }, `${c.req.method} ${c.req.path} ${status}`);
};
```

One structured log per request. Level is derived from status code.

### 6.5 `backend/src/lib/errors.ts` — standard API error shape

```ts
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export interface ApiErrorBody {
  error: string;
  code?: string;
  requestId: string;
}

export class HttpError extends Error {
  constructor(
    public readonly status: ContentfulStatusCode,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  error: string,
  code?: string,
) {
  const body: ApiErrorBody = {
    error,
    code,
    requestId: c.get('requestId') ?? 'unknown',
  };
  return c.json(body, status);
}
```

- Every error response from our own routes uses this shape.
- `HttpError` can be thrown from any route handler — `onError` in `app.ts` catches and converts.
- `requestId` in the body means a user can quote their error and we can grep logs.

### 6.6 `backend/src/db/index.ts` — pool with config and graceful close

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  allowExitOnIdle: false,
});

pool.on('error', (err) => {
  // Background errors from idle clients — log but don't crash
  logger.error({ err }, 'postgres pool background error');
});

export const db = drizzle(pool);

export async function closePool(): Promise<void> {
  logger.info('closing postgres pool');
  await pool.end();
}
```

### 6.7 `backend/src/routes/health.ts` — split liveness and readiness

```ts
import { Hono } from 'hono';
import { pool } from '../db/index.js';
import { apiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const health = new Hono();

// Liveness — process is up. Used by Docker healthcheck for restart-on-crash.
health.get('/live', (c) => {
  return c.json({ status: 'alive', timestamp: new Date().toISOString() });
});

// Readiness — process is ready to serve. Used by load balancers to route traffic.
health.get('/ready', async (c) => {
  try {
    await pool.query('SELECT 1');
    return c.json({
      status: 'ready',
      db: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    logger.warn({ err, requestId: c.get('requestId') }, 'readiness check failed');
    return apiError(c, 503, 'database unreachable', 'DB_UNREACHABLE');
  }
});

export default health;
```

Returning 503 on DB failure is an explicit error the caller sees — not error swallowing. The calling code (Traefik, load balancer, humans) can tell something is wrong because the status code is non-200 and the error body is structured.

### 6.8 `backend/src/app.ts` — middleware composition

```ts
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { cors } from 'hono/cors';
import { env } from './config/env.js';
import { requestId } from './middleware/requestId.js';
import { requestLogger } from './middleware/logger.js';
import { HttpError, apiError } from './lib/errors.js';
import { logger } from './lib/logger.js';
import health from './routes/health.js';
import { auth } from './auth/index.js';

export function createApp() {
  const app = new Hono();

  app.use('*', requestId);
  app.use('*', requestLogger);
  app.use('*', secureHeaders({
    strictTransportSecurity: 'max-age=31536000; includeSubDomains',
    xFrameOptions: 'DENY',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    // CSP deferred to feature/observability-baseline
  }));
  app.use('*', cors({
    origin: env.CORS_ORIGINS.split(',').map((s) => s.trim()),
    credentials: true,
  }));

  // Better Auth — handles every /api/auth/* route internally
  app.on(['POST', 'GET'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  // App routes
  app.route('/api/health', health);

  // Global error handler
  app.onError((err, c) => {
    const requestId = c.get('requestId');
    logger.error({ err, requestId, path: c.req.path }, 'unhandled error');
    if (err instanceof HttpError) {
      return apiError(c, err.status, err.message, err.code);
    }
    return apiError(c, 500, 'Internal server error', 'INTERNAL_ERROR');
  });

  app.notFound((c) => apiError(c, 404, 'not found', 'NOT_FOUND'));

  return app;
}
```

### 6.9 `backend/src/index.ts` — boot with graceful shutdown

```ts
import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { closePool } from './db/index.js';

const app = createApp();

const server = serve(
  { fetch: app.fetch, port: env.PORT },
  (info) => {
    logger.info({ port: info.port, env: env.NODE_ENV }, 'backend listening');
  },
);

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutdown initiated');
  server.close();
  try {
    await closePool();
  } catch (err) {
    logger.error({ err }, 'error draining pg pool during shutdown');
  }
  await new Promise((resolve) => setTimeout(resolve, 100)); // pino flush grace
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaught exception');
  shutdown('uncaughtException');
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'unhandled rejection');
  shutdown('unhandledRejection');
});
```

## 7. Better Auth integration

### 7.1 Schema generation workflow

Sequence is load-bearing:

```bash
cd backend

# 1. Install Better Auth
npm install better-auth

# 2. Author backend/src/auth/index.ts (section 7.2 below)

# 3. Run the CLI to generate the schema
npx @better-auth/cli@latest generate --config src/auth/index.ts --output src/db/schema.ts

# 4. Review the generated schema.ts

# 5. Generate the initial Drizzle migration
npm run db:generate

# 6. Review drizzle/0000_*.sql

# 7. Commit: src/auth/index.ts + src/db/schema.ts + drizzle/
```

The circular-looking import (`auth/index.ts` → `db/index.ts` → `db/schema.ts`) is safe because the Better Auth CLI only *evaluates* the config to introspect `additionalFields` — it doesn't run queries. The placeholder `schema.ts` (with its `users` table) exists when CLI runs, and the CLI overwrites it with the generated content.

### 7.2 `backend/src/auth/index.ts` — full config

```ts
/**
 * Better Auth instance.
 *
 * Used by two different tools:
 *   1. The Better Auth CLI (`npx @better-auth/cli generate`) reads this file
 *      to produce src/db/schema.ts. The CLI only evaluates the config — it
 *      doesn't run DB queries — so the circular import through db is safe.
 *   2. The Hono app mounts auth.handler at /api/auth/* in src/app.ts. At
 *      runtime, this config drives every auth flow.
 *
 * DO NOT add queries or side effects at module load time.
 */

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index.js';
import { env } from '../config/env.js';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),

  secret: env.AUTH_SECRET,
  baseURL: env.APP_PUBLIC_URL,

  emailAndPassword: {
    enabled: true,
    // Email verification requires an email transport, deferred to
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
        // admin/seller via the signup payload. A vitest integration test
        // guards this — do NOT remove either the flag or the test.
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
    useSecureCookies: env.APP_PUBLIC_URL.startsWith('https'),
    defaultCookieAttributes: {
      sameSite: 'lax',
      httpOnly: true,
      path: '/',
    },
  },
});

export type Session = typeof auth.$Infer.Session;
```

### 7.3 Expected generated schema

The CLI produces (approximately):

```ts
import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),                    // nanoid
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  role: text('role').notNull().default('buyer'),  // additionalFields
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

Load-bearing details every later branch depends on:

- `user.id` is `text` (nanoid), **not uuid**. Every FK pointing at the user table in future branches must be `text('user_id').references(() => user.id)`.
- Table names are **singular** (`user`, not `users`). The placeholder plural `users` table is deleted.
- `user.role` has a default of `'buyer'` and gets added to the schema because of `additionalFields` — no separate migration needed.
- The `account.password` column holds the password hash. Never queried or logged directly.

### 7.4 What branch 1 explicitly does NOT ship

| Feature | Why deferred | Target branch |
|---|---|---|
| Email verification | Needs email transport | `feature/email-verification` |
| Password reset | Needs email transport | `feature/email-verification` |
| Google OAuth | Separate concern, Google Console setup | `feature/oauth-google` |
| `requireRole` middleware | No protected endpoints exist yet | `feature/marketplace-schema-rbac` |
| Better Auth `admin()` plugin | Needs RBAC middleware | `feature/marketplace-schema-rbac` |
| Rate limiting on `/api/auth/*` | Observability layer | `feature/observability-baseline` |
| Account linking (email user adds Google) | Needs Google OAuth first | `feature/oauth-google` |
| 2FA / MFA | Post-MVP | Not scheduled |
| Session impersonation | Post-MVP admin feature | Not scheduled |

### 7.5 Known gap — manual password reset

Until `feature/email-verification` lands, a user who forgets their password cannot recover it through the UI. Workaround documented in `CONVENTIONS.md`:

1. Generate a new password hash using Better Auth's password hashing (out-of-band).
2. Update `account.password` directly in Postgres for the user's row.
3. Invalidate all existing sessions: `DELETE FROM "session" WHERE "user_id" = ?`.

Acceptable for MVP because the first seller is the developer/owner.

## 8. Frontend auth flow

### 8.1 `frontend/src/lib/api/server.ts` — server-side API client

The load-bearing piece of the whole frontend layer. Every server component that talks to the backend must use this. Bare `fetch()` from a server component is forbidden because it silently loses authentication.

```ts
import 'server-only';
import { cookies, headers } from 'next/headers';
import { serverEnv } from '../config/env.server.js';

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

interface ServerFetchOptions extends Omit<RequestInit, 'headers'> {
  path: string;
  headers?: Record<string, string>;
}

export async function serverFetch<T = unknown>(
  options: ServerFetchOptions,
): Promise<T> {
  const { path, headers: extraHeaders, ...init } = options;

  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  const hdrs = await headers();
  const requestId = hdrs.get('x-request-id') ?? undefined;

  const url = `${serverEnv.API_URL_INTERNAL}${path}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      accept: 'application/json',
      ...extraHeaders,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...(requestId ? { 'x-request-id': requestId } : {}),
    },
    cache: 'no-store',
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

Key properties:
- `'server-only'` import: build-time guard. If any client component imports this file, Next.js fails the build.
- Cookies are read via `await cookies()` (Next.js 16 async).
- Request ID is forwarded so backend logs correlate to the page request.
- `cache: 'no-store'` — auth-dependent fetches must never be cached.
- Errors propagate as `ApiFetchError`. No swallowing.

### 8.2 `frontend/src/lib/api/client.ts` — browser fetch helper

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

Two separate `ApiFetchError` classes (one in each file) is intentional — tree-shaking works correctly and no client bundle pulls in server-only code.

### 8.3 `frontend/src/lib/auth/session.ts`

```ts
import 'server-only';
import { serverFetch } from '../api/server.js';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'buyer' | 'seller' | 'admin';
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  user: SessionUser;
  session: {
    id: string;
    expiresAt: string;
    userId: string;
  };
}

export async function getSession(): Promise<Session | null> {
  return serverFetch<Session | null>({
    path: '/api/auth/session',
    method: 'GET',
  });
}
```

Better Auth returns the session object or `null` (status 200 in both cases), so the return type is `Session | null`. Network and backend failures propagate as `ApiFetchError` and surface in the Next.js error boundary.

### 8.4 `frontend/src/lib/config/env.server.ts`

```ts
import 'server-only';
import { z } from 'zod';

const schema = z.object({
  API_URL_INTERNAL: z.string().url(),
});

function parse() {
  const parsed = schema.safeParse({
    API_URL_INTERNAL: process.env.API_URL_INTERNAL,
  });
  if (!parsed.success) {
    console.error('❌ Invalid server environment:');
    console.error(parsed.error.format());
    throw new Error('Invalid server environment');
  }
  return parsed.data;
}

export const serverEnv = parse();
```

Branch 1 has exactly one server env var on the frontend. Branch 1 has zero `NEXT_PUBLIC_*` variables.

### 8.5 Next.js configuration update

```ts
// frontend/next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',

  async rewrites() {
    const apiUrl = process.env.API_URL_INTERNAL;
    if (!apiUrl) {
      throw new Error(
        'API_URL_INTERNAL is required at build time. ' +
        'Set it in .env.development or docker build args.',
      );
    }
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },

  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '9000', pathname: '/**' },
      { protocol: 'https', hostname: 'staging.balikha.ph', pathname: '/storage/**' },
      { protocol: 'https', hostname: 'balikha.ph', pathname: '/storage/**' },
    ],
  },
};

export default nextConfig;
```

Rewrites are evaluated at build time; `API_URL_INTERNAL` must be set for `next build` to succeed. CI smoke test (`docker build frontend` with no backend) uses a placeholder value.

### 8.6 Auth layout (split-screen, 60/40)

```tsx
// frontend/src/app/(auth)/AuthLayout.tsx
import type { ReactNode } from 'react';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

export function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <div className={styles.container}>
      <aside className={styles.branding}>
        <div className={styles.brandingContent}>
          <h1 className={styles.brandName}>Balikha</h1>
          <div className={styles.brandAccent} />
          <p className={styles.brandTagline}>
            Artisan marketplace — handcrafted pottery and more
          </p>
          <p className={styles.brandFootnote}>
            Built by artisans, for artisans.
          </p>
        </div>
      </aside>
      <section className={styles.formPane}>
        <div className={styles.formContent}>
          <header className={styles.formHeader}>
            <h2 className={styles.formTitle}>{title}</h2>
            {subtitle && <p className={styles.formSubtitle}>{subtitle}</p>}
          </header>
          {children}
          {footer && <p className={styles.formFooter}>{footer}</p>}
        </div>
      </section>
    </div>
  );
}
```

CSS: 60/40 grid on desktop (`3fr 2fr`), deep red branding panel on the left with cream text and a gold accent bar, cream form panel on the right. On viewports ≤768px, the layout reflows to stacked: compact branding header above a full-width form. Branding is semantic (not `aria-hidden`), keeping it accessible to screen readers regardless of viewport. Full CSS in the implementation — follows the patterns established in section 4.

### 8.7 Login and signup pages

Both pages are server components that check for an existing session and redirect to `/` if authenticated. They wrap their respective client forms in `AuthLayout`. The forms post to `/api/auth/sign-in/email` and `/api/auth/sign-up/email` via `clientFetch`, then `router.push('/')` + `router.refresh()` on success to force server components to re-render with the new session cookie.

Error handling: form state includes `error: string | null`. On `ApiFetchError`, the form displays the server's error message inside a `role="alert"` element with the danger semantic color.

The submit button respects the 10-character password minimum via `minLength={10}` on the input, matching Better Auth's policy.

### 8.8 Logout — client component, no dedicated route

```tsx
// frontend/src/app/components/LogoutButton.tsx
'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { clientFetch, ApiFetchError } from '@/lib/api/client';
import styles from './LogoutButton.module.css';

export function LogoutButton() {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setError(null);
    setSigningOut(true);
    try {
      await clientFetch('/api/auth/sign-out', { method: 'POST' });
      router.push('/');
      router.refresh();
    } catch (err) {
      setSigningOut(false);
      setError(
        err instanceof ApiFetchError
          ? err.message
          : 'Failed to sign out. Please try again.',
      );
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={signingOut}
        className={styles.button}
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
      {error && (
        <span role="alert" className={styles.error}>
          {error}
        </span>
      )}
    </>
  );
}
```

No `/logout` route. The home page imports `LogoutButton` and renders it next to the user's email when a session exists. On sign-out failure, the button shows the error instead of silently redirecting.

### 8.9 Home page — session-aware, uses server API client

```tsx
// frontend/src/app/page.tsx
import Link from 'next/link';
import { serverFetch, ApiFetchError } from '@/lib/api/server';
import { getSession } from '@/lib/auth/session';
import { LogoutButton } from './components/LogoutButton';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface HealthResponse {
  status: string;
  db: string;
  timestamp: string;
}

type HealthResult =
  | { kind: 'ok'; data: HealthResponse }
  | { kind: 'unreachable'; error: string };

async function fetchHealth(): Promise<HealthResult> {
  try {
    const data = await serverFetch<HealthResponse>({ path: '/api/health/ready' });
    return { kind: 'ok', data };
  } catch (err) {
    console.error('health check failed:', err);
    return {
      kind: 'unreachable',
      error: err instanceof ApiFetchError ? err.message : 'unknown error',
    };
  }
}

export default async function Home() {
  const [session, health] = await Promise.all([getSession(), fetchHealth()]);
  // ... render with session-aware greeting and health card
}
```

The `HealthResult` discriminated union is the "no swallowing" pattern — the caller cannot confuse "unreachable" with "healthy null". The error is logged before being wrapped into a display state. This pattern repeats throughout later branches whenever a server component needs to degrade gracefully.

### 8.10 Error, not-found, and global-error pages

All three use CSS Modules consistent with the rest of the app. No inline styles.

- `error.tsx` — segment error boundary, uses tokens.
- `not-found.tsx` — 404 page, uses tokens.
- `global-error.tsx` — root error boundary (wraps `<html>` and `<body>`), also uses CSS Modules with tokens. Justification: if tokens fail to load, the entire app is broken anyway — there's no realistic scenario where `global-error.tsx` needs a safer styling strategy than any other component.

## 9. Environment files

### 9.1 `.env.development` (committed, local Docker Compose)

```env
NODE_ENV=development

# Postgres (local Docker only)
POSTGRES_DB=balikha
POSTGRES_USER=balikha
POSTGRES_PASSWORD=secret
DATABASE_URL=postgresql://balikha:secret@db:5432/balikha

# MinIO (local Docker only — not browser-resolvable)
MINIO_ENDPOINT=http://minio:9000
MINIO_ACCESS_KEY=balikha
MINIO_SECRET_KEY=balikhasecret
MINIO_BUCKET=balikha

# Next.js → backend (internal Docker service name)
API_URL_INTERNAL=http://backend:8787

# Public URL for Better Auth baseURL
APP_PUBLIC_URL=http://localhost:3000

# Better Auth — deterministic dev-only secret (committed; NOT a real secret)
AUTH_SECRET=dev-only-secret-at-least-32-characters-fixed-ok

# CORS — Hono allows the Next.js dev origin
CORS_ORIGINS=http://localhost:3000
```

### 9.2 `.env.example` (committed, template)

```env
# Template for .env.staging and .env.production (VPS only, chmod 600).
# NEVER commit filled-in .env.staging or .env.production files.

NODE_ENV=production

POSTGRES_DB=balikha
POSTGRES_USER=balikha
POSTGRES_PASSWORD=CHANGE_ME_openssl_rand_base64_32
DATABASE_URL=postgresql://balikha:CHANGE_ME@<db-service-name>:5432/balikha

MINIO_ENDPOINT=http://<minio-service-name>:9000
MINIO_ACCESS_KEY=CHANGE_ME_openssl_rand_base64_24
MINIO_SECRET_KEY=CHANGE_ME_openssl_rand_base64_32
MINIO_BUCKET=balikha

API_URL_INTERNAL=http://<backend-service-name>:8787
APP_PUBLIC_URL=https://<domain>

AUTH_SECRET=CHANGE_ME_openssl_rand_base64_64

CORS_ORIGINS=https://<domain>
```

### 9.3 Post-rename grep check

After the env rename commit, run `grep -r "API_URL" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.next` and verify every hit is either `API_URL_INTERNAL`, a comment explaining the rename, or nothing. Any bare `API_URL` match is a missed reference.

## 10. CONVENTIONS.md contents

The full text that lands at repo root. This file is load-bearing: later branches reference it for rules that can't be enforced by linters.

```markdown
# Balikha conventions

Rules and patterns that can't easily be enforced by linters but are
load-bearing for the codebase. Read this before changing anything in
`frontend/src/app/(auth)/`, `backend/src/auth/`, `backend/src/config/`,
or `backend/src/middleware/`.

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
handle both cases explicitly. See `frontend/src/app/page.tsx`
`fetchHealth()` for the canonical example.

## No fallback logic (from CLAUDE.md)

Never use default values to mask missing data. `value ?? 'default'`
is forbidden when nil indicates a bug. If data is missing, throw.
Exception: error message fallbacks (`err.message ?? 'Unknown error'`)
are fine because the error is still thrown.

## Backend import direction

Strict one-way dependency:

routes → lib, middleware, db, auth
middleware → lib, config
auth → db, config
db → config
lib → config
config → (nothing)

No layer depends on anything above it.

## Frontend fetch contexts — three different worlds

1. Server components → backend: use `serverFetch` from `@/lib/api/server`.
   Bare `fetch()` from a server component is FORBIDDEN — it silently
   loses authentication.

2. Client components → backend: use `clientFetch` from `@/lib/api/client`.
   Relative `/api/*` paths go through Next.js rewrites, cookies forward
   automatically.

3. Route handlers and server actions: not used. Branch 1 has zero
   `app/api/` route handlers. If a future branch needs one, stop and
   discuss — it breaks the "no app/api" invariant.

## Dynamic rendering

Every page that fetches backend data must include:

    export const dynamic = 'force-dynamic';

Reason: Next.js 16 is aggressive about static prerendering; pages that
fetch at build time will fail CI builds that run `docker build frontend`
without a backend reachable.

## CSS Modules only

All styling lives in `*.module.css` files colocated with the component.
Reference design tokens via `var(--*)` — never hardcode colors or
spacing values. Tokens are defined once in
`frontend/src/styles/tokens.css`.

No Tailwind. No utility classes. No static inline styles. Dynamic values from props/state (a computed width, a user-positioned tooltip) may use the React `style` prop. Everything else lives in a `*.module.css` file.

## Design tokens — load order matters

`tokens.css` must be imported BEFORE `globals.css` in `layout.tsx`:

    import '@/styles/tokens.css';  // must be first
    import './globals.css';

Tokens define custom properties on `:root`. If tokens load after
globals, any token references in globals.css break silently.

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
- Any small text (< 14pt)

When in doubt, use `--brand-primary` or `--neutral-900` for text.

## Migration strategy — Option A

Drizzle migrations run via `npx drizzle-kit migrate` in
`backend/entrypoint.sh` at container startup. `drizzle-kit` is kept
in the runtime image via multi-stage Dockerfile (devDependencies
carry through from builder to runner).

Do NOT add `--omit=dev` to the `npm ci` step unless you also add
`drizzle-kit` to production dependencies.

Constraint: staging and production each run a SINGLE backend container.
Multi-container scale-out would require an init container or leader
lock. That's a separate branch — do not scale first and ask later.

## Better Auth — load-bearing details

- `user.id` is `text` (nanoid), NOT uuid. Every FK pointing at the
  user table in future branches must be `text('user_id').references(() => user.id)`.
- Table names are singular (`user`, not `users`).
- `additionalFields.role.input = false` MUST stay. Removing it allows
  users to self-assign `role: 'admin'` during signup — trivial
  privilege escalation. A vitest integration test guards this
  (`backend/src/auth/auth.integration.test.ts`). Do not delete that
  test.
- Password minimum length is 10 (NIST-style: length over complexity).
- Email verification is DISABLED in MVP (no email transport yet).

## Logging — don't log secrets

Never log:
- Passwords (even hashed)
- `AUTH_SECRET` or any other env secret
- Session cookies or tokens
- Full request bodies on auth routes

The structured logger (`backend/src/lib/logger.ts`) only logs request
metadata (method, path, status, duration, requestId). If you add
route-level logging, keep it to high-level facts, not payloads.

## Owner account model

The developer/owner uses TWO SEPARATE accounts: one with role='seller'
for shop management, one with role='admin' strictly for administrative
tasks. Rationale: principle of least privilege.

- The admin session never holds seller state.
- The seller session never holds admin capabilities.
- A compromised seller session cannot escalate.
- A malformed admin action cannot affect the developer's own shop.

When working on the app as yourself, always use the seller account
unless you're specifically doing admin work.

## Shared API contract strategy — committed

Branch 1 has no custom API endpoints, so no contracts infrastructure
lands here. Branch 2 (`feature/marketplace-schema-rbac`) creates
`packages/contracts/` as an npm workspace and lands the first shared
Zod schemas alongside shops/items/orders CRUD.

When adding a new custom API endpoint:
1. Define the request and response Zod schema in `packages/contracts/src/<domain>.ts`
2. Import and use it in the backend route with `@hono/zod-validator`
3. Import and use it in the frontend form with `@hookform/resolvers/zod`
4. Never duplicate the schema. The contracts package is the single
   source of truth.

Hono RPC (`hc` client) is explicitly NOT used — framework independence
is valued over endpoint URL inference.

## Manual admin password reset (MVP workaround)

Until `feature/email-verification` lands, a user who forgets their
password must have it reset via direct DB intervention:

1. Generate a new password hash with Better Auth's password hashing.
2. Update `account.password` directly in Postgres for the user's
   email/password account row.
3. Invalidate all sessions:
   `DELETE FROM "session" WHERE "user_id" = ?`

Document this in support-facing docs when the app onboards real users.

## Commit message format

Conventional Commits. One of:

- `feat(scope): description` — new feature
- `fix(scope): description` — bug fix
- `chore(scope): description` — tooling, deps, env
- `docs(scope): description` — documentation
- `test(scope): description` — tests only
- `refactor(scope): description` — refactor without behavior change

Scopes for branch 1: `backend`, `frontend`, `auth`, `env`, `home`, `e2e`.
```

## 11. Testing strategy

### 11.1 Approach

Two tiers:

1. **Unit tests with mocks** for pure/isolated code — env validation, health route, error helpers. Fast, no external dependencies.
2. **Integration tests with testcontainers** (`@testcontainers/postgresql`) for anything that touches Better Auth — sign-up, sign-in, session, sign-out. One Postgres container per test file, migrations run in `beforeAll`, tables truncated in `beforeEach`. Honest, ~5–10s startup per file, runs in parallel.

No `pg-mem`, no shared ambient DB, no in-memory adapters.

### 11.2 Test-time env setup

`backend/src/config/env.ts` calls `process.exit(1)` at module load time when env is invalid. This is the correct production behavior (fail fast), but it means any test that transitively imports `env.js` needs valid env vars set *before* import. The solution is a vitest setup file that runs before any test file loads:

```ts
// backend/vitest.setup.ts
// Test-safe env defaults — runs before any test file imports.
// Integration tests may override these in their own beforeAll hooks.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.MINIO_ENDPOINT = 'http://localhost:9000';
process.env.MINIO_ACCESS_KEY = 'testkey';
process.env.MINIO_SECRET_KEY = 'testsecret';
process.env.MINIO_BUCKET = 'test';
process.env.AUTH_SECRET = 'test-secret-at-least-32-characters-long-ok';
process.env.APP_PUBLIC_URL = 'http://localhost:3000';
process.env.CORS_ORIGINS = 'http://localhost:3000';
```

Wired up via `backend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

This is **not** a fallback in the CLAUDE.md sense — it's the test runner's explicit source of truth for env vars, parallel to how production takes env from `.env.development`. Integration tests that need a real Postgres override `DATABASE_URL` in `beforeAll` after starting a testcontainer; unit tests accept the defaults as-is.

### 11.3 Env validation tests

`backend/src/config/env.test.ts` — tests `parseEnv` directly with varying input dicts:

- valid env dict → returns parsed
- missing `AUTH_SECRET` → throws `EnvValidationError`
- short `AUTH_SECRET` (<32) → throws
- malformed `DATABASE_URL` → throws
- invalid `NODE_ENV` value (e.g., `'staging'`) → throws
- PORT coerces from string to number
- PORT default (8787) applied when unset

No mocks, no I/O, runs in milliseconds.

### 11.4 Health route tests

`backend/src/routes/health.test.ts` — mocks `../db/index.js` and `../lib/logger.js`:

- `GET /api/health/live` → 200, body `{ status: 'alive' }`
- `GET /api/health/ready` with DB success → 200, body `{ db: 'connected' }`
- `GET /api/health/ready` with DB failure → **503**, body `{ error: 'database unreachable', code: 'DB_UNREACHABLE', requestId }`

The 503 test is the one that catches the original review Issue 2 (error swallowing in health route).

### 11.5 Auth integration tests (testcontainers)

`backend/src/auth/auth.integration.test.ts` — one Postgres container per test file, full Drizzle migrations applied, real Better Auth flows.

Required tests:

1. **Sign-up creates user with default role `'buyer'`** — verifies schema + migration are correct.
2. **Sign-up rejects short password (<10 chars)** — verifies `minPasswordLength` is active.
3. **★ Sign-up ignores `role: 'admin'` in payload** — the critical security test. Proves `input: false` is active. File comment: `// DO NOT DELETE — guards privilege escalation.`
4. **Sign-in → session → sign-out round-trip** — signs up, signs in, reads session with cookie, signs out, verifies session is invalid after. Also asserts `set-cookie` header contains `balikha` prefix.
5. **Sign-in with wrong password returns 401** — proves password validation is active.

Test file outline:

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
// ...

let container: StartedPostgreSqlContainer;
let pool: pg.Pool;
let app: Awaited<ReturnType<typeof makeAppForTest>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16').start();
  // Set all required env vars BEFORE importing anything that reads them
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = container.getConnectionUri();
  process.env.AUTH_SECRET = 'test-secret-at-least-32-characters-long-ok';
  process.env.APP_PUBLIC_URL = 'http://localhost:3000';
  // ... all other required env vars
  pool = new pg.Pool({ connectionString: container.getConnectionUri() });
  await migrate(drizzle(pool), { migrationsFolder: './drizzle' });
  app = await makeAppForTest();
}, 60_000);

afterAll(async () => {
  await pool?.end();
  await container?.stop();
});

beforeEach(async () => {
  await pool.query('TRUNCATE "user", "session", "account", "verification" CASCADE');
});
```

### 11.6 Frontend RTL tests

- `LoginForm.test.tsx` — renders form, submits credentials, navigates home on success, shows error on 401, re-enables submit button after failure.
- `SignupForm.test.tsx` — similar structure.
- `LogoutButton.test.tsx` — clicking triggers `clientFetch('/api/auth/sign-out')`, navigates home + refreshes on success, shows error on failure.

Pattern: mock `next/navigation` (`useRouter`) and `@/lib/api/client` (`clientFetch`). Use `@testing-library/user-event` for interactions.

### 11.7 Playwright e2e

`e2e/auth.spec.ts` — one full-flow test plus one negative-path test:

1. **Sign-up → land on home → session visible → sign-out → anonymous** — happy path.
2. **Login with wrong credentials shows error** — alert role visible.

Existing `e2e/landing.spec.ts` stays.

### 11.8 Running tests

```bash
# Backend (unit + integration — testcontainers starts as needed)
cd backend && npm test

# Frontend (unit + component)
cd frontend && npm test

# E2E — requires docker compose up first
docker compose up -d
cd .. && npm run test:e2e
```

### 11.9 NOT in scope for branch 1 tests

- Coverage thresholds (land reporting, don't gate merges on a number yet)
- Mutation testing
- Visual regression testing
- Load testing
- CI pipeline wiring (`ops/ci-cd-pipeline` branch)

## 12. Commit plan

Eleven commits, each a logical unit that builds and tests green independently. Tests land with the features they test, not in a separate bundle.

| # | Commit | Purpose |
|---|---|---|
| 1 | `docs: add CONVENTIONS.md with branch conventions` | Reviewer has rules before seeing code |
| 2 | `chore: dev tooling — prettier, husky, lint-staged` | Formatting runs on subsequent commits |
| 3 | `feat(backend): foundation layer — env, logger, middleware, error shape, security headers` | All backend middleware + env validation + env tests |
| 4 | `feat(backend): health endpoint split with /live and /ready` | Health routes + tests + pool config + graceful shutdown |
| 5 | `chore(env): rename API_URL → API_URL_INTERNAL, add AUTH_SECRET and APP_PUBLIC_URL` | Lands before frontend foundation so frontend can read new vars |
| 6 | `feat(frontend): migrate from Tailwind to CSS Modules with design tokens` | Delete tailwind deps, add tokens.css, rewrite globals/layout/page/HealthCheck |
| 7 | `feat(frontend): zod env, server/client API clients, error pages, image remotePatterns` | Frontend foundations parallel to backend foundations |
| 8 | `feat(auth/backend): better-auth config, schema generation, migration, mount` | Auth backend complete, schema committed, migration committed |
| 9 | `test(auth/backend): integration tests with testcontainers` | Tests against the real schema, including the `input: false` security test |
| 10 | `feat(auth/frontend): auth layout, login, signup, logout button, home page wire-up` | All frontend auth UI + their RTL tests |
| 11 | `test(e2e): auth flow spec` | E2e requires everything else to work |

Each commit passes:
- Prettier + ESLint
- TypeScript typecheck
- Tests relevant to that commit
- Dockerfile / next.config builds (for commits 6, 7, 10 touching frontend build)

## 13. Review checklist (what `/claude-review-against-plan` verifies)

### Structural
- [ ] Every file listed in section 5 exists (or is explicitly deleted)
- [ ] `frontend/postcss.config.mjs` is deleted
- [ ] `tailwindcss` and `@tailwindcss/postcss` removed from `frontend/package.json`
- [ ] `backend/src/db/schema.ts` contains Better Auth-generated tables (not the placeholder `users` table)
- [ ] `backend/drizzle/0000_*.sql` exists and applies cleanly
- [ ] `CONVENTIONS.md` exists at repo root with all sections from section 10
- [ ] `frontend/src/styles/tokens.css` contains the full token set from section 4
- [ ] `.env.development` uses `API_URL_INTERNAL` (not `API_URL`)
- [ ] `.env.development` defines `AUTH_SECRET` and `APP_PUBLIC_URL`

### Behavior
- [ ] `parseEnv` throws on missing `AUTH_SECRET`
- [ ] `parseEnv` throws on `AUTH_SECRET` shorter than 32 chars
- [ ] `GET /api/health/ready` returns 503 on DB failure (not 200)
- [ ] `GET /api/health/ready` returns `{ error, code, requestId }` shape on failure
- [ ] Better Auth config has `additionalFields.role.input = false`
- [ ] Better Auth config has `minPasswordLength: 10`
- [ ] Integration test asserts role `'buyer'` after signup with `role: 'admin'` in payload
- [ ] Integration test file name or comment flags the security test as non-deletable
- [ ] `backend/src/app.ts` middleware order: requestId → logger → secureHeaders → cors → auth mount → routes → onError → notFound
- [ ] Every `frontend/src/app/**/page.tsx` that fetches data has `export const dynamic = 'force-dynamic'`

### Scope guards (no creep)
- [ ] No `frontend/src/app/api/` route handlers
- [ ] No Google OAuth configuration in `backend/src/auth/index.ts`
- [ ] No `admin()` plugin in Better Auth config
- [ ] No `requireRole` middleware file
- [ ] No Sentry / observability code beyond pino logger
- [ ] No rate limiting middleware
- [ ] No `shops`, `items`, `orders`, `order_items` tables in `schema.ts`
- [ ] No email transport configuration
- [ ] No `packages/contracts/` workspace (deferred to branch 2)

### Convention guards
- [ ] No `color: var(--brand-support)` on elements smaller than 14pt (grep check on CSS Modules)
- [ ] No bare `fetch()` in server components (grep for `fetch(` in `.tsx` files without `use client`)
- [ ] No `catch (e) { return null }` patterns
- [ ] Backend files respect import direction
- [ ] Every `.tsx` in `frontend/src/app` with local styles has a sibling `.module.css` (no inline styles beyond the React style prop for genuinely dynamic values)
- [ ] `server-only` is imported from every module listed in section 8 that should be server-only

### Tests exist
- [ ] `backend/src/config/env.test.ts`
- [ ] `backend/src/routes/health.test.ts` (rewritten for 503)
- [ ] `backend/src/auth/auth.integration.test.ts` with all 5 required tests from section 11.5
- [ ] `frontend/src/app/(auth)/login/LoginForm.test.tsx`
- [ ] `frontend/src/app/(auth)/signup/SignupForm.test.tsx`
- [ ] `frontend/src/app/components/LogoutButton.test.tsx`
- [ ] `e2e/auth.spec.ts`

## 14. Out of scope for branch 1 (explicit deferrals)

- **Google OAuth** — `feature/oauth-google`
- **Email verification and password reset** — `feature/email-verification`
- **RBAC middleware (`requireRole`) and Better Auth admin plugin** — `feature/marketplace-schema-rbac`
- **`shops`, `items`, `orders`, `order_items` tables** — `feature/marketplace-schema-rbac`
- **Admin dashboard scaffold (route group, guards)** — `feature/marketplace-schema-rbac`
- **Admin dashboard content (metrics, user management, moderation, logs viewer)** — `feature/admin-dashboard-core` and `feature/admin-dashboard-metrics`
- **Structured error monitoring (Sentry)** — `feature/observability-baseline`
- **Rate limiting** — `feature/observability-baseline`
- **Content-Security-Policy configuration** — `feature/observability-baseline`
- **Shared contracts package (`packages/contracts/`)** — `feature/marketplace-schema-rbac`
- **File upload endpoint and MinIO client** — `feature/seller-dashboard`
- **PayMongo integration and webhook** — `feature/checkout-paymongo`
- **CI/CD pipeline (GitHub Actions)** — `ops/ci-cd-pipeline`
- **Traefik reverse proxy and compose files for staging/production** — `ops/traefik-deployment`
- **Backup and disaster recovery scripts** — `ops/backup-dr`
- **Legal pages (ToS, Privacy Policy, Cookie Policy)** — `docs/legal-baseline`
- **i18n scaffolding** — future, not yet scheduled
- **Coverage thresholds in CI** — future, not yet scheduled
- **2FA / MFA for admin accounts** — post-MVP
- **Session impersonation** — post-MVP

## 15. Open questions flagged for future branches

None of these block branch 1, but each should be resolved before the relevant later branch starts.

- **Email transport choice** (Resend, Postmark, SES, SMTP) — decide during `feature/email-verification`.
- **Component library layer** for richer UI primitives (Radix UI unstyled + CSS Modules vs React Aria vs hand-built) — decide during `feature/seller-dashboard` when forms get more complex. Branch 1 uses React's native form controls and `useState` only.
- **TanStack Table and Recharts** — install when `feature/admin-dashboard-core` / `feature/admin-dashboard-metrics` need them.
- **Database seed script for dev fixtures** — decide during `feature/marketplace-schema-rbac` (needs real data to seed).
- **Audit log schema shape** — decide during `feature/marketplace-schema-rbac`. Every admin action must write to an append-only `audit_events` table.
- **Soft delete strategy** — decide during `feature/marketplace-schema-rbac`. Consistent `deletedAt` column across tables or none.
- **Pagination shape** (limit+offset vs cursor, query param naming) — decide during `feature/public-catalog`.
- **Postgres ICU collation for Filipino text** — verify during `feature/marketplace-schema-rbac` when actual text columns land.

## 16. Done criteria

Branch 1 is complete when:

1. All 11 commits from section 12 are on the `feature/foundations-and-auth-skeleton` branch.
2. `backend && npm test` passes (unit + integration).
3. `frontend && npm test` passes (unit + RTL).
4. `docker compose up -d && npm run test:e2e` passes (Playwright).
5. Running `docker compose up -d` brings up the full stack, the home page renders, and a user can sign up → see session on home → sign out.
6. `/claude-review-against-plan` passes all checks in section 13.
7. No Tailwind files, no `app/api/` route handlers, no out-of-scope features from section 14 present.
8. The branch is mergeable to `main` (no conflicts, passing checks).

After merging, implementation moves to branch 2 (`feature/marketplace-schema-rbac`) with its own spec, plan, and review cycle.
