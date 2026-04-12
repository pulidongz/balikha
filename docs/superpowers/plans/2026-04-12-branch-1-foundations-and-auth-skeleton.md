# Branch 1: Foundations and Auth Skeleton — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the monolithic Next.js foundation and Better Auth email/password authentication for the Balikha marketplace.

**Architecture:** Single Next.js 16 app at repo root. Better Auth via `toNextJsHandler` at `src/app/api/auth/[...all]/route.ts`. Server-only code in `src/server/` and `src/lib/auth.ts` with `import 'server-only'` guard. CSS Modules with design tokens. Six commits.

**Tech Stack:** Next.js 16.2.2, React 19.2.4, Better Auth, Drizzle ORM, PostgreSQL 16, pino, Zod, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-04-12-branch-1-foundations-and-auth-skeleton-monolithic-design.md`

---

## Prerequisites

Before starting implementation:

- [ ] Docker Desktop is running
- [ ] Start the dev database: `docker compose up -d db`
- [ ] Create the test database (one-time):
  ```bash
  psql "postgresql://balikha:secret@localhost:5432/postgres" -c "CREATE DATABASE balikha_test;"
  ```
- [ ] Create a git worktree for isolated implementation:
  ```bash
  git worktree add ../balikha-branch1 -b feature/foundations-and-auth-skeleton
  cd ../balikha-branch1
  ```

All file paths in this plan are relative to the worktree root (`../balikha-branch1/`).

---

## Task 1: CONVENTIONS.md and spec references

**Commit:** `docs: add CONVENTIONS.md and branch 1 design spec references`

### Task 1.1: Create CONVENTIONS.md

**Files:** Create `CONVENTIONS.md`

- [ ] Create `CONVENTIONS.md` at repo root with the full content below.

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

### Task 1.2: Update old spec frontmatter

**Files:** Modify `docs/superpowers/specs/2026-04-12-branch-1-foundations-and-auth-skeleton-design.md`

- [ ] Verify the old spec already has `status: superseded` in frontmatter. If not, update it.

The old spec should already have this frontmatter (it was updated previously):
```yaml
status: superseded
superseded_by: /Users/pul/Projects/Others/Claude Project Plans/gpul-pottery/balikha/docs/superpowers/specs/2026-04-12-branch-1-foundations-and-auth-skeleton-monolithic-design.md
```

### Task 1.3: Commit 1

- [ ] Stage and commit:

```bash
git add CONVENTIONS.md docs/superpowers/specs/2026-04-12-branch-1-foundations-and-auth-skeleton-design.md
git commit -m "$(cat <<'EOF'
docs: add CONVENTIONS.md and branch 1 design spec references
EOF
)"
```

---

## Task 2: Flatten to monolithic Next.js with CSS Modules and design tokens

**Commit:** `refactor(repo): flatten to monolithic Next.js with CSS Modules and design tokens`

This is the largest commit. It restructures the entire repository.

### Task 2.1: Delete backend/ directory

**Files:** Delete `backend/`

- [ ] Remove the entire backend directory:

```bash
rm -rf backend/
```

### Task 2.2: Move frontend/src/ to src/ and clean up frontend/

**Files:** Move `frontend/src/` to `src/`, move `frontend/public/` to `public/`, copy `frontend/next-env.d.ts`

- [ ] Move frontend source and assets to repo root:

```bash
# Move src directory (delete existing if any conflicts)
rm -rf src/
cp -r frontend/src/ src/

# Move public directory
rm -rf public/
cp -r frontend/public/ public/

# Copy next-env.d.ts
cp frontend/next-env.d.ts next-env.d.ts

# Copy eslint config
cp frontend/eslint.config.mjs eslint.config.mjs

# Delete old frontend directory
rm -rf frontend/
```

### Task 2.3: Delete old HealthCheck component and test

**Files:** Delete `src/app/components/HealthCheck.tsx`, `src/app/components/HealthCheck.test.tsx`

- [ ] Remove HealthCheck files (no longer needed — no `/api/health` in branch 1):

```bash
rm -f src/app/components/HealthCheck.tsx src/app/components/HealthCheck.test.tsx
```

### Task 2.4: Write consolidated package.json

**Files:** Create `package.json`

- [ ] Write the consolidated `package.json`:

```json
{
  "name": "balikha",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "npm run db:migrate && next dev",
    "build": "next build",
    "start": "next start",
    "db:migrate": "tsx scripts/migrate.ts",
    "db:generate": "drizzle-kit generate",
    "db:studio": "drizzle-kit studio",
    "lint": "eslint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "prepare": "husky"
  },
  "dependencies": {
    "next": "16.2.2",
    "react": "19.2.4",
    "react-dom": "19.2.4",
    "better-auth": "^1.2.8",
    "drizzle-orm": "^0.45.2",
    "pg": "^8.20.0",
    "pino": "^9.6.0",
    "server-only": "^0.0.1",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.59.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^22",
    "@types/pg": "^8.20.0",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "@vitejs/plugin-react": "^6.0.1",
    "@vitest/coverage-v8": "^4.1.4",
    "drizzle-kit": "^0.31.10",
    "eslint": "^9",
    "eslint-config-next": "16.2.2",
    "husky": "^9.1.0",
    "jsdom": "^29.0.2",
    "lint-staged": "^16.0.0",
    "pino-pretty": "^13.0.0",
    "prettier": "^3.8.1",
    "tsx": "^4.21.0",
    "typescript": "^5.7.0",
    "vitest": "^4.1.4"
  },
  "lint-staged": {
    "*.{ts,tsx,js,mjs,css,json,md}": "prettier --write"
  }
}
```

**Note on TypeScript version:** The spec says to try `^6.0.x` first, but fall back to `^5.7.x` if Better Auth, Drizzle, eslint-config-next, or @testing-library/react fail to compile. Start with `^5.7.0` and verify. If everything works, try upgrading to `^6.0.x` in a separate step and keep whichever works.

### Task 2.5: Install dependencies

- [ ] Remove old lockfile and node_modules, then install fresh:

```bash
rm -rf node_modules/ package-lock.json
npm install
```

**Expected output:** Clean install with no peer dependency errors. If TypeScript 6 causes issues, edit `package.json` to use `"typescript": "^5.7.0"` and re-run `npm install`.

- [ ] Verify TypeScript compatibility:

```bash
npx tsc --version
npx tsc --noEmit
```

If `tsc --noEmit` fails with TS 6, switch to `"typescript": "^5.7.0"` in `package.json` and re-install.

### Task 2.6: Write tsconfig.json

**Files:** Create `tsconfig.json`

- [ ] Write the updated `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```

### Task 2.7: Write next.config.ts

**Files:** Create `next.config.ts`

- [ ] Write the simplified `next.config.ts` (no rewrites, no API proxy):

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      // MinIO/S3 patterns will be added in feature/seller-dashboard
    ],
  },
};

export default nextConfig;
```

### Task 2.8: Remove Tailwind — delete postcss.config.mjs

**Files:** Delete `postcss.config.mjs` (if it exists at repo root from frontend/)

- [ ] Remove any PostCSS/Tailwind config files:

```bash
rm -f postcss.config.mjs
```

### Task 2.9: Create design tokens

**Files:** Create `src/styles/tokens.css`

- [ ] Create the styles directory and write `tokens.css`:

```bash
mkdir -p src/styles
```

Write `src/styles/tokens.css`:

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

### Task 2.10: Rewrite globals.css

**Files:** Create `src/app/globals.css`

- [ ] Write the CSS reset (no Tailwind imports):

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

### Task 2.11: Rewrite layout.tsx with CSS Modules

**Files:** Create `src/app/layout.tsx`, `src/app/layout.module.css`

- [ ] Write `src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import '@/styles/tokens.css';
import './globals.css';
import styles from './layout.module.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Balikha',
  description: 'Artisan marketplace — handcrafted pottery and more',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className={styles.body}>{children}</body>
    </html>
  );
}
```

- [ ] Write `src/app/layout.module.css`:

```css
.body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  font-family: var(--font-sans);
  background-color: var(--brand-bg);
  color: var(--neutral-900);
}
```

### Task 2.12: Rewrite page.tsx (placeholder, no auth yet)

**Files:** Create `src/app/page.tsx`, `src/app/page.module.css`

- [ ] Write `src/app/page.tsx` (simple placeholder — auth-aware version comes in commit 5):

```tsx
import styles from './page.module.css';

export default function Home() {
  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Balikha</h1>
        <p className={styles.tagline}>
          Artisan marketplace — handcrafted pottery and more
        </p>
      </main>
    </div>
  );
}
```

- [ ] Write `src/app/page.module.css`:

```css
.container {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
}

.main {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-16) var(--space-8);
  max-width: 42rem;
  width: 100%;
}

.title {
  font-size: var(--text-4xl);
  font-weight: 700;
  letter-spacing: -0.025em;
  color: var(--neutral-900);
}

.tagline {
  font-size: var(--text-lg);
  color: var(--neutral-500);
}

.greeting {
  font-size: var(--text-base);
  color: var(--neutral-700);
}

.link {
  color: var(--brand-primary);
  text-decoration: underline;
}

.link:hover {
  color: var(--brand-primary-hover);
}
```

### Task 2.13: Add error pages

**Files:** Create `src/app/error.tsx`, `src/app/error.module.css`, `src/app/not-found.tsx`, `src/app/not-found.module.css`, `src/app/global-error.tsx`, `src/app/global-error.module.css`

- [ ] Write `src/app/error.tsx`:

```tsx
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

- [ ] Write `src/app/error.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  padding: var(--space-8);
  text-align: center;
}

.title {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--neutral-900);
  margin-bottom: var(--space-4);
}

.description {
  font-size: var(--text-base);
  color: var(--neutral-500);
  margin-bottom: var(--space-6);
}

.button {
  padding: var(--space-3) var(--space-6);
  background-color: var(--brand-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  cursor: pointer;
}

.button:hover {
  background-color: var(--brand-primary-hover);
}

.button:active {
  background-color: var(--brand-primary-active);
}

.button:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
```

- [ ] Write `src/app/not-found.tsx`:

```tsx
import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <main className={styles.container}>
      <h1 className={styles.title}>Page not found</h1>
      <p className={styles.description}>
        The page you are looking for does not exist or has been moved.
      </p>
      <Link href="/" className={styles.link}>
        Go home
      </Link>
    </main>
  );
}
```

- [ ] Write `src/app/not-found.module.css`:

```css
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 50vh;
  padding: var(--space-8);
  text-align: center;
}

.title {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--neutral-900);
  margin-bottom: var(--space-4);
}

.description {
  font-size: var(--text-base);
  color: var(--neutral-500);
  margin-bottom: var(--space-6);
}

.link {
  padding: var(--space-3) var(--space-6);
  background-color: var(--brand-primary);
  color: #fff;
  border-radius: var(--radius-md);
  text-decoration: none;
  font-size: var(--text-base);
}

.link:hover {
  background-color: var(--brand-primary-hover);
}

.link:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
```

- [ ] Write `src/app/global-error.tsx`:

```tsx
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

- [ ] Write `src/app/global-error.module.css`:

```css
.body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  font-family: var(--font-sans);
  background-color: var(--brand-bg);
  color: var(--neutral-900);
}

.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--space-8);
  text-align: center;
}

.title {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--neutral-900);
  margin-bottom: var(--space-4);
}

.description {
  font-size: var(--text-base);
  color: var(--neutral-500);
  margin-bottom: var(--space-6);
}

.button {
  padding: var(--space-3) var(--space-6);
  background-color: var(--brand-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  cursor: pointer;
}

.button:hover {
  background-color: var(--brand-primary-hover);
}

.button:active {
  background-color: var(--brand-primary-active);
}

.button:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
```

### Task 2.14: Update .env.development

**Files:** Modify `.env.development`

- [ ] Rewrite `.env.development` with the simplified 4-variable schema:

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

### Task 2.15: Update .env.example

**Files:** Modify `.env.example`

- [ ] Rewrite `.env.example`:

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

### Task 2.16: Rewrite docker-compose.yml

**Files:** Modify `docker-compose.yml`

- [ ] Rewrite `docker-compose.yml` (Postgres only, no backend/frontend/minio):

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

### Task 2.17: Update .gitignore

**Files:** Modify `.gitignore`

- [ ] Update `.gitignore` to include drizzle output and additional patterns:

```
# Dependencies
node_modules/

# Build output
dist/
.next/

# Environment (keep .env.development and .env.example)
.env
.env.local
.env.staging
.env.preprod
.env.production

# OS
.DS_Store

# IDE
.vscode/
.idea/
.claude/

# Docker
*.log

# Test artifacts
coverage/
playwright-report/
test-results/
.playwright/

# Drizzle
drizzle/meta/
```

### Task 2.18: Update playwright.config.ts

**Files:** Modify `playwright.config.ts`

- [ ] Rewrite `playwright.config.ts` to add webServer config for auto-starting dev:

```ts
import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
  },
});
```

### Task 2.19: Update e2e/landing.spec.ts

**Files:** Modify `e2e/landing.spec.ts`

- [ ] Rewrite `e2e/landing.spec.ts` to reflect the new home page (no health check):

```ts
import { test, expect } from '@playwright/test';

test.describe('Landing page', () => {
  test('displays Balikha title and tagline', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Balikha' })).toBeVisible();
    await expect(page.getByText('Artisan marketplace')).toBeVisible();
  });
});
```

### Task 2.20: Add .prettierrc

**Files:** Create `.prettierrc`

- [ ] Write `.prettierrc`:

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### Task 2.21: Clean up stale files

**Files:** Delete various stale files

- [ ] Remove files that no longer belong:

```bash
# Remove old frontend-specific files that shouldn't be at root
rm -f .nvmrc  # will re-create if needed, but it already exists at root

# Remove stale Dockerfiles (deferred to ops branch)
rm -f Dockerfile

# Remove old CLAUDE.md and AGENTS.md from frontend (already deleted with frontend/)
# These are already gone after rm -rf frontend/

# Remove postcss config if somehow still present
rm -f postcss.config.mjs
```

### Task 2.22: Verify build

- [ ] Run the build to confirm everything compiles:

```bash
npm run build
```

**Expected output:** Build succeeds with exit code 0. No TypeScript errors. No CSS compilation errors.

### Task 2.23: Commit 2

- [ ] Stage and commit:

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor(repo): flatten to monolithic Next.js with CSS Modules and design tokens
EOF
)"
```

---

## Task 3: Foundation layer — env, db, logger, proxy, vitest config

**Commit:** `feat(server): foundation layer — env, logger, db, proxy, prettier, husky`

### Task 3.1: Create server directory structure

- [ ] Create the directory structure:

```bash
mkdir -p src/server/config
mkdir -p src/server/lib
mkdir -p src/server/db
mkdir -p src/lib/api
mkdir -p scripts
```

### Task 3.2: Write src/server/config/env.ts

**Files:** Create `src/server/config/env.ts`

- [ ] Write the env validation module:

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

### Task 3.3: Write src/server/lib/logger.ts

**Files:** Create `src/server/lib/logger.ts`

- [ ] Write the logger module:

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

### Task 3.4: Write src/server/db/index.ts

**Files:** Create `src/server/db/index.ts`

- [ ] Write the database module:

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

### Task 3.5: Write src/server/db/schema.ts (placeholder)

**Files:** Create `src/server/db/schema.ts`

- [ ] Write a placeholder schema file (Better Auth CLI will overwrite this in Task 4):

```ts
// This file will be generated by the Better Auth CLI.
// Placeholder until commit 4.
export {};
```

### Task 3.6: Write src/proxy.ts

**Files:** Create `src/proxy.ts`

- [ ] Write the proxy (request ID generation):

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

### Task 3.7: Write scripts/migrate.ts

**Files:** Create `scripts/migrate.ts`

- [ ] Write the migration runner script. **Important:** Before writing, verify the exact import path for the Drizzle migrator against the installed version:

```bash
# Check the available exports
ls node_modules/drizzle-orm/node-postgres/
```

Then write `scripts/migrate.ts`:

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
    console.error('DATABASE_URL is required for migrations');
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

**Note:** If the import path `drizzle-orm/node-postgres/migrator` does not exist for the installed drizzle-orm version, try `drizzle-orm/migrator` instead and adjust the import.

### Task 3.8: Write drizzle.config.ts

**Files:** Create `drizzle.config.ts`

- [ ] Write `drizzle.config.ts` at repo root:

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

### Task 3.9: Write vitest.config.ts

**Files:** Create `vitest.config.ts`

- [ ] Write the unified vitest config:

```ts
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

### Task 3.10: Write vitest.setup.ts

**Files:** Create `vitest.setup.ts`

- [ ] Write the vitest setup file:

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

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

afterEach(() => {
  cleanup();
});
```

### Task 3.11: Set up husky

- [ ] Initialize husky and create the pre-commit hook:

```bash
npx husky init
```

- [ ] Write `.husky/pre-commit`:

```bash
npx lint-staged
```

### Task 3.12: Write env unit tests

**Files:** Create `src/server/config/env.test.ts`

- [ ] Write `src/server/config/env.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseEnv, EnvValidationError } from './env.js';

const validEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  AUTH_SECRET: 'test-secret-at-least-32-characters-long-ok',
  APP_URL: 'http://localhost:3000',
};

describe('parseEnv', () => {
  it('returns parsed env for valid input', () => {
    const result = parseEnv(validEnv);
    expect(result.NODE_ENV).toBe('development');
    expect(result.DATABASE_URL).toBe('postgresql://user:pass@localhost:5432/db');
    expect(result.AUTH_SECRET).toBe('test-secret-at-least-32-characters-long-ok');
    expect(result.APP_URL).toBe('http://localhost:3000');
  });

  it('throws EnvValidationError when AUTH_SECRET is missing', () => {
    const { AUTH_SECRET: _, ...env } = validEnv;
    expect(() => parseEnv(env)).toThrow(EnvValidationError);
  });

  it('throws EnvValidationError when AUTH_SECRET is shorter than 32 characters', () => {
    expect(() => parseEnv({ ...validEnv, AUTH_SECRET: 'short' })).toThrow(EnvValidationError);
  });

  it('throws EnvValidationError when DATABASE_URL is malformed', () => {
    expect(() => parseEnv({ ...validEnv, DATABASE_URL: 'not-a-url' })).toThrow(
      EnvValidationError,
    );
  });

  it('throws EnvValidationError when NODE_ENV is invalid', () => {
    expect(() => parseEnv({ ...validEnv, NODE_ENV: 'staging' })).toThrow(EnvValidationError);
  });
});
```

### Task 3.13: Verify tests pass

- [ ] Run the env tests:

```bash
npm test -- src/server/config/env.test.ts
```

**Expected output:** 5 tests pass.

### Task 3.14: Verify build still works

- [ ] Verify `npm run build` succeeds:

```bash
npm run build
```

### Task 3.15: Commit 3

- [ ] Stage and commit:

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(server): foundation layer — env, logger, db, proxy, prettier, husky
EOF
)"
```

---

## Task 4: Better Auth config, schema, migration, route handler, security tests

**Commit:** `feat(auth): Better Auth config, schema, migration, catch-all handler, security tests`

### Task 4.1: Install Better Auth and pin CLI

- [ ] Check what version of better-auth was installed:

```bash
npm ls better-auth
```

- [ ] Install the Better Auth CLI with a pinned exact version:

```bash
# First check what version is available
npm view @better-auth/cli version

# Install with exact version (replace X.Y.Z with the actual version)
npm install -D @better-auth/cli@X.Y.Z --save-exact
```

Verify the CLI is pinned (no `^` or `~`) in `package.json`.

### Task 4.2: Write src/lib/auth.ts

**Files:** Create `src/lib/auth.ts`

- [ ] Write the Better Auth configuration:

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
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // rolling refresh if session > 1 day old
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

### Task 4.3: Generate Better Auth schema

- [ ] Set shell env and generate the schema:

```bash
set -a && source .env.development && set +a
npx @better-auth/cli generate --output src/server/db/schema.ts
```

- [ ] Review the generated `src/server/db/schema.ts`. Verify it contains:
  - `user` table with `role` (text, default 'buyer') and `avatarUrl` (optional text)
  - `session` table
  - `account` table
  - `verification` table
  - `user.id` is `text` (nanoid), not uuid

### Task 4.4: Generate Drizzle migration

- [ ] Generate the initial migration:

```bash
set -a && source .env.development && set +a
npm run db:generate
```

**Expected output:** A file `drizzle/0000_*.sql` is created.

- [ ] Review the generated SQL file to confirm it creates the correct tables.

### Task 4.5: Run migration against dev database

- [ ] Ensure the database is running:

```bash
docker compose up -d db
```

- [ ] Run migrations:

```bash
set -a && source .env.development && set +a
npm run db:migrate
```

**Expected output:** `Migrations complete.`

- [ ] Run migrations against the test database:

```bash
DATABASE_URL=postgresql://balikha:secret@localhost:5432/balikha_test npm run db:migrate
```

### Task 4.6: Create catch-all auth route handler

**Files:** Create `src/app/api/auth/[...all]/route.ts`

- [ ] Create the directory structure and write the route handler:

```bash
mkdir -p src/app/api/auth/\[...all\]
```

Write `src/app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth';

export const { GET, POST } = toNextJsHandler(auth);
```

### Task 4.7: Write auth security tests

**Files:** Create `src/lib/auth.test.ts`

- [ ] Write `src/lib/auth.test.ts`:

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

### Task 4.8: Run auth tests

- [ ] Run the auth tests (requires Postgres running with balikha_test database):

```bash
npm test -- src/lib/auth.test.ts
```

**Expected output:** 4 tests pass. The two `input: false` security tests verify that `role` is always `'buyer'`.

### Task 4.9: Run full test suite

- [ ] Run all tests:

```bash
npm test
```

**Expected output:** All env tests (5) and auth tests (4) pass.

### Task 4.10: Verify build

- [ ] Verify `npm run build` succeeds without a reachable database:

```bash
DATABASE_URL=postgresql://fake:fake@localhost:1/fake npm run build
```

**Expected output:** Build succeeds. The page with `force-dynamic` is not statically rendered, so it doesn't try to connect.

### Task 4.11: Commit 4

- [ ] Stage and commit:

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(auth): Better Auth config, schema, migration, catch-all handler, security tests
EOF
)"
```

---

## Task 5: Auth UI — layout, login, signup, logout button, session-aware home

**Commit:** `feat(app): auth UI — layout, login, signup, logout button, session-aware home`

### Task 5.1: Create auth route group directory structure

- [ ] Create directories:

```bash
mkdir -p "src/app/(auth)/login"
mkdir -p "src/app/(auth)/signup"
mkdir -p src/app/components
```

### Task 5.2: Write client-side fetch helper

**Files:** Create `src/lib/api/client.ts`

- [ ] Write `src/lib/api/client.ts`:

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

### Task 5.3: Write AuthLayout

**Files:** Create `src/app/(auth)/AuthLayout.tsx`, `src/app/(auth)/AuthLayout.module.css`

- [ ] Write `src/app/(auth)/AuthLayout.tsx`:

```tsx
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  children: React.ReactNode;
  heading: string;
}

export function AuthLayout({ children, heading }: AuthLayoutProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.brand}>
        <div className={styles.brandContent}>
          <h1 className={styles.brandTitle}>Balikha</h1>
          <p className={styles.brandTagline}>
            Artisan marketplace — handcrafted pottery and more
          </p>
          <div className={styles.accentBar} aria-hidden="true" />
          <p className={styles.brandFootnote}>Built by artisans, for artisans.</p>
        </div>
      </div>
      <div className={styles.form}>
        <div className={styles.formContent}>
          <h2 className={styles.formHeading}>{heading}</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
```

- [ ] Write `src/app/(auth)/AuthLayout.module.css`:

```css
.wrapper {
  display: grid;
  grid-template-columns: 3fr 2fr;
  min-height: 100vh;
}

@media (max-width: 768px) {
  .wrapper {
    grid-template-columns: 1fr;
  }
}

.brand {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--brand-primary);
  padding: var(--space-8);
}

@media (max-width: 768px) {
  .brand {
    padding: var(--space-6) var(--space-4);
    min-height: auto;
  }
}

.brandContent {
  max-width: 28rem;
  text-align: center;
}

.brandTitle {
  font-size: var(--text-4xl);
  font-weight: 700;
  color: var(--neutral-100);
  margin-bottom: var(--space-4);
}

.brandTagline {
  font-size: var(--text-lg);
  color: var(--neutral-100);
  opacity: 0.92;
  margin-bottom: var(--space-6);
  line-height: var(--leading-normal);
}

.accentBar {
  width: 4rem;
  height: 4px;
  background-color: var(--brand-accent);
  margin: 0 auto var(--space-6);
  border-radius: var(--radius-full);
}

.brandFootnote {
  font-size: var(--text-sm);
  color: var(--neutral-100);
  opacity: 0.7;
}

.form {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--brand-bg);
  padding: var(--space-8);
}

.formContent {
  width: 100%;
  max-width: 24rem;
}

.formHeading {
  font-size: var(--text-2xl);
  font-weight: 700;
  color: var(--neutral-900);
  margin-bottom: var(--space-6);
}
```

### Task 5.4: Write LoginForm

**Files:** Create `src/app/(auth)/login/LoginForm.tsx`, `src/app/(auth)/login/LoginForm.module.css`

- [ ] Write `src/app/(auth)/login/LoginForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { clientFetch, ApiFetchError } from '@/lib/api/client';
import styles from './LoginForm.module.css';

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      await clientFetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      router.push('/');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiFetchError) {
        setError(err.message);
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor="email" className={styles.label}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={styles.input}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="current-password"
          className={styles.input}
        />
      </div>
      <button type="submit" disabled={loading} className={styles.button}>
        {loading ? 'Signing in...' : 'Sign in'}
      </button>
    </form>
  );
}
```

- [ ] Write `src/app/(auth)/login/LoginForm.module.css`:

```css
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.error {
  padding: var(--space-3) var(--space-4);
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--neutral-700);
}

.input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--neutral-300);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  background-color: var(--neutral-50);
  color: var(--neutral-900);
}

.input:focus {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-color: var(--brand-primary);
}

.button {
  padding: var(--space-3) var(--space-6);
  background-color: var(--brand-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  margin-top: var(--space-2);
}

.button:hover {
  background-color: var(--brand-primary-hover);
}

.button:active {
  background-color: var(--brand-primary-active);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.button:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
```

### Task 5.5: Write login page

**Files:** Create `src/app/(auth)/login/page.tsx`

- [ ] Write `src/app/(auth)/login/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { AuthLayout } from '../AuthLayout';
import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect('/');
  }

  return (
    <AuthLayout heading="Sign in to Balikha">
      <LoginForm />
      <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--neutral-500)' }}>
        Don&apos;t have an account?{' '}
        <Link href="/signup" style={{ color: 'var(--brand-primary)', textDecoration: 'underline' }}>
          Create one
        </Link>
      </p>
    </AuthLayout>
  );
}
```

### Task 5.6: Write SignupForm

**Files:** Create `src/app/(auth)/signup/SignupForm.tsx`, `src/app/(auth)/signup/SignupForm.module.css`

- [ ] Write `src/app/(auth)/signup/SignupForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { clientFetch, ApiFetchError } from '@/lib/api/client';
import styles from './SignupForm.module.css';

export function SignupForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const name = formData.get('name') as string;
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    try {
      await clientFetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      router.push('/');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiFetchError) {
        setError(err.message);
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {error && (
        <div role="alert" className={styles.error}>
          {error}
        </div>
      )}
      <div className={styles.field}>
        <label htmlFor="name" className={styles.label}>
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className={styles.input}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="email" className={styles.label}>
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className={styles.input}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor="password" className={styles.label}>
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          className={styles.input}
        />
      </div>
      <button type="submit" disabled={loading} className={styles.button}>
        {loading ? 'Creating account...' : 'Create account'}
      </button>
    </form>
  );
}
```

- [ ] Write `src/app/(auth)/signup/SignupForm.module.css`:

```css
.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.error {
  padding: var(--space-3) var(--space-4);
  background-color: var(--color-danger-bg);
  color: var(--color-danger);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.label {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--neutral-700);
}

.input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--neutral-300);
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  background-color: var(--neutral-50);
  color: var(--neutral-900);
}

.input:focus {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
  border-color: var(--brand-primary);
}

.button {
  padding: var(--space-3) var(--space-6);
  background-color: var(--brand-primary);
  color: #fff;
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--text-base);
  font-weight: 500;
  cursor: pointer;
  margin-top: var(--space-2);
}

.button:hover {
  background-color: var(--brand-primary-hover);
}

.button:active {
  background-color: var(--brand-primary-active);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.button:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}
```

### Task 5.7: Write signup page

**Files:** Create `src/app/(auth)/signup/page.tsx`

- [ ] Write `src/app/(auth)/signup/page.tsx`:

```tsx
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { auth } from '@/lib/auth';
import { AuthLayout } from '../AuthLayout';
import { SignupForm } from './SignupForm';

export const dynamic = 'force-dynamic';

export default async function SignupPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session) {
    redirect('/');
  }

  return (
    <AuthLayout heading="Create your account">
      <SignupForm />
      <p style={{ marginTop: 'var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--neutral-500)' }}>
        Already have an account?{' '}
        <Link href="/login" style={{ color: 'var(--brand-primary)', textDecoration: 'underline' }}>
          Sign in
        </Link>
      </p>
    </AuthLayout>
  );
}
```

### Task 5.8: Write LogoutButton

**Files:** Create `src/app/components/LogoutButton.tsx`, `src/app/components/LogoutButton.module.css`

- [ ] Write `src/app/components/LogoutButton.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { clientFetch, ApiFetchError } from '@/lib/api/client';
import styles from './LogoutButton.module.css';

export function LogoutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setError(null);
    setLoading(true);

    try {
      await clientFetch('/api/auth/sign-out', {
        method: 'POST',
      });
      router.push('/');
      router.refresh();
    } catch (err) {
      if (err instanceof ApiFetchError) {
        setError(err.message);
      } else {
        throw err;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleLogout}
        disabled={loading}
        className={styles.button}
      >
        {loading ? 'Signing out...' : 'Sign out'}
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

- [ ] Write `src/app/components/LogoutButton.module.css`:

```css
.button {
  background: none;
  border: none;
  color: var(--brand-primary);
  text-decoration: underline;
  cursor: pointer;
  font-size: inherit;
  padding: 0;
}

.button:hover {
  color: var(--brand-primary-hover);
}

.button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.button:focus-visible {
  outline: var(--focus-ring-width) solid var(--focus-ring-color);
  outline-offset: var(--focus-ring-offset);
}

.error {
  color: var(--color-danger);
  font-size: var(--text-sm);
  margin-left: var(--space-2);
}
```

### Task 5.9: Rewrite home page with session awareness

**Files:** Modify `src/app/page.tsx`

- [ ] Rewrite `src/app/page.tsx` to be session-aware:

```tsx
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
            <Link href="/login" className={styles.link}>
              Sign in
            </Link>
            {' or '}
            <Link href="/signup" className={styles.link}>
              create an account
            </Link>
          </p>
        )}
      </main>
    </div>
  );
}
```

### Task 5.10: Write LoginForm RTL test

**Files:** Create `src/app/(auth)/login/LoginForm.test.tsx`

- [ ] Write `src/app/(auth)/login/LoginForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoginForm } from './LoginForm';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

const mockClientFetch = vi.fn();

vi.mock('@/lib/api/client', () => ({
  clientFetch: (...args: unknown[]) => mockClientFetch(...args),
  ApiFetchError: class ApiFetchError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiFetchError';
      this.status = status;
    }
  },
}));

describe('LoginForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the login form fields', () => {
    render(<LoginForm />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('submits credentials and navigates on success', async () => {
    const user = userEvent.setup();
    mockClientFetch.mockResolvedValueOnce({ user: { email: 'test@example.com' } });

    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'test-password-10');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockClientFetch).toHaveBeenCalledWith('/api/auth/sign-in/email', expect.objectContaining({
      method: 'POST',
    }));
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows error on failed login', async () => {
    const user = userEvent.setup();
    const { ApiFetchError } = await import('@/lib/api/client');
    mockClientFetch.mockRejectedValueOnce(new ApiFetchError(401, 'Invalid credentials'));

    render(<LoginForm />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong-password-10');
    await user.click(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
  });
});
```

### Task 5.11: Write SignupForm RTL test

**Files:** Create `src/app/(auth)/signup/SignupForm.test.tsx`

- [ ] Write `src/app/(auth)/signup/SignupForm.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignupForm } from './SignupForm';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

const mockClientFetch = vi.fn();

vi.mock('@/lib/api/client', () => ({
  clientFetch: (...args: unknown[]) => mockClientFetch(...args),
  ApiFetchError: class ApiFetchError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiFetchError';
      this.status = status;
    }
  },
}));

describe('SignupForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the signup form fields', () => {
    render(<SignupForm />);
    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('submits form data and navigates on success', async () => {
    const user = userEvent.setup();
    mockClientFetch.mockResolvedValueOnce({ user: { email: 'new@example.com' } });

    render(<SignupForm />);

    await user.type(screen.getByLabelText('Name'), 'New User');
    await user.type(screen.getByLabelText('Email'), 'new@example.com');
    await user.type(screen.getByLabelText('Password'), 'test-password-10');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(mockClientFetch).toHaveBeenCalledWith('/api/auth/sign-up/email', expect.objectContaining({
      method: 'POST',
    }));
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows error on failed signup', async () => {
    const user = userEvent.setup();
    const { ApiFetchError } = await import('@/lib/api/client');
    mockClientFetch.mockRejectedValueOnce(new ApiFetchError(400, 'Email already exists'));

    render(<SignupForm />);

    await user.type(screen.getByLabelText('Name'), 'Existing');
    await user.type(screen.getByLabelText('Email'), 'existing@example.com');
    await user.type(screen.getByLabelText('Password'), 'test-password-10');
    await user.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email already exists');
  });
});
```

### Task 5.12: Write LogoutButton RTL test

**Files:** Create `src/app/components/LogoutButton.test.tsx`

- [ ] Write `src/app/components/LogoutButton.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogoutButton } from './LogoutButton';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

const mockClientFetch = vi.fn();

vi.mock('@/lib/api/client', () => ({
  clientFetch: (...args: unknown[]) => mockClientFetch(...args),
  ApiFetchError: class ApiFetchError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.name = 'ApiFetchError';
      this.status = status;
    }
  },
}));

describe('LogoutButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a sign out button', () => {
    render(<LogoutButton />);
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('calls sign-out endpoint and navigates on click', async () => {
    const user = userEvent.setup();
    mockClientFetch.mockResolvedValueOnce({});

    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(mockClientFetch).toHaveBeenCalledWith('/api/auth/sign-out', expect.objectContaining({
      method: 'POST',
    }));
    expect(mockPush).toHaveBeenCalledWith('/');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('shows error on failed sign-out', async () => {
    const user = userEvent.setup();
    const { ApiFetchError } = await import('@/lib/api/client');
    mockClientFetch.mockRejectedValueOnce(new ApiFetchError(500, 'Server error'));

    render(<LogoutButton />);

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
  });
});
```

### Task 5.13: Run all tests

- [ ] Run the full test suite:

```bash
npm test
```

**Expected output:** All tests pass:
- `src/server/config/env.test.ts` — 5 tests
- `src/lib/auth.test.ts` — 4 tests
- `src/app/(auth)/login/LoginForm.test.tsx` — 3 tests
- `src/app/(auth)/signup/SignupForm.test.tsx` — 3 tests
- `src/app/components/LogoutButton.test.tsx` — 3 tests

### Task 5.14: Verify build

- [ ] Verify `npm run build` succeeds:

```bash
DATABASE_URL=postgresql://fake:fake@localhost:1/fake npm run build
```

### Task 5.15: Commit 5

- [ ] Stage and commit:

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(app): auth UI — layout, login, signup, logout button, session-aware home
EOF
)"
```

---

## Task 6: E2E auth flow spec

**Commit:** `test(e2e): auth flow spec`

### Task 6.1: Write e2e auth test

**Files:** Create `e2e/auth.spec.ts`

- [ ] Write `e2e/auth.spec.ts`:

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

### Task 6.2: Run e2e tests

- [ ] Ensure the dev server is running with a real database:

```bash
# In a separate terminal, or let Playwright auto-start:
docker compose up -d db
# Make sure migrations are applied
set -a && source .env.development && set +a && npm run db:migrate
```

- [ ] Run Playwright tests:

```bash
npm run test:e2e
```

**Expected output:** 2 tests pass (signup flow and wrong-credentials error).

### Task 6.3: Commit 6

- [ ] Stage and commit:

```bash
git add -A
git commit -m "$(cat <<'EOF'
test(e2e): auth flow spec
EOF
)"
```

---

## Post-Completion Verification

After all 6 commits are on the branch, run this full verification checklist.

### Build and Test

- [ ] `npm test` passes (env unit + auth security + RTL tests)
- [ ] `npm run test:e2e` passes (Playwright against dev server)
- [ ] `npm run build` succeeds
- [ ] `DATABASE_URL=postgresql://fake:fake@localhost:1/fake npm run build` succeeds (offline build)

### Manual Smoke Test

- [ ] `docker compose up -d db && npm run dev` starts the app
- [ ] Home page renders at `http://localhost:3000`
- [ ] Navigate to `/signup`, create an account
- [ ] Redirected to `/`, see "Signed in as {email}"
- [ ] Click "Sign out", see sign-in/sign-up links
- [ ] Navigate to `/login`, sign in with the created account

### Structural Checks

- [ ] `backend/` directory does not exist
- [ ] `frontend/` directory does not exist
- [ ] `src/app/`, `src/server/`, `src/styles/`, `src/lib/`, `src/proxy.ts` all exist
- [ ] `scripts/migrate.ts` exists
- [ ] `tsconfig.json` defines `@/*` -> `./src/*`
- [ ] No `postcss.config.mjs`
- [ ] No `tailwindcss` or `@tailwindcss/postcss` in `package.json`
- [ ] No `hono` or `@hono/node-server` in `package.json`
- [ ] No `@testcontainers/postgresql` in `package.json`
- [ ] `src/server/db/schema.ts` contains `user`, `session`, `account`, `verification` tables
- [ ] `drizzle/0000_*.sql` exists
- [ ] `CONVENTIONS.md` exists at repo root
- [ ] `src/styles/tokens.css` contains the full token set
- [ ] `.env.development` has exactly `NODE_ENV`, `POSTGRES_*`, `DATABASE_URL`, `APP_URL`, `AUTH_SECRET`
- [ ] `docker-compose.yml` has only the `db` service
- [ ] `drizzle.config.ts` points `schema` at `./src/server/db/schema.ts` and `out` at `./drizzle`
- [ ] `@better-auth/cli` is pinned to an exact version (no `^` or `~`) in `package.json`

### Behavior Checks

- [ ] `parseEnv` throws on missing `AUTH_SECRET`
- [ ] `parseEnv` throws on `AUTH_SECRET` shorter than 32 chars
- [ ] Better Auth config has `additionalFields.role.input = false`
- [ ] Better Auth config has `minPasswordLength: 10`
- [ ] `src/lib/auth.test.ts` contains both HTTP-path and direct-API `input: false` security tests
- [ ] `src/app/api/auth/[...all]/route.ts` exports GET and POST via `toNextJsHandler(auth)`
- [ ] `src/proxy.ts` sanitizes incoming `x-request-id` with regex `{16,64}`
- [ ] `src/app/global-error.tsx` is `'use client'`, renders own `<html>` and `<body>`, imports tokens + globals, uses `unstable_retry`
- [ ] `src/app/error.tsx` uses `unstable_retry`
- [ ] Every page with `auth.api.getSession` has `export const dynamic = 'force-dynamic'`

### Scope Guards

- [ ] No route handlers in `src/app/api/` other than the Better Auth catch-all
- [ ] No Google OAuth in auth config
- [ ] No `admin()` plugin
- [ ] No `requireRole` proxy guard
- [ ] No rate limiting
- [ ] No Sentry
- [ ] No marketplace tables
- [ ] No email transport
- [ ] No `packages/contracts/` workspace
- [ ] No `/api/health` route
- [ ] No Hono imports anywhere
- [ ] No `src/server/lib/errors.ts`

### Convention Guards

- [ ] Every file in `src/server/` starts with `import 'server-only'`
- [ ] `src/lib/auth.ts` starts with `import 'server-only'`
- [ ] `scripts/migrate.ts` does NOT import `'server-only'` and does NOT import from `src/server/`
- [ ] No `@import "tailwindcss"` anywhere
- [ ] No Tailwind utility class patterns in `className` strings
- [ ] Every `.tsx` in `src/app/` with local styles has a sibling `.module.css`

### Tests Exist

- [ ] `src/server/config/env.test.ts` with at least 5 cases
- [ ] `src/lib/auth.test.ts` with 4 tests (including both `input: false` security tests)
- [ ] `src/app/(auth)/login/LoginForm.test.tsx`
- [ ] `src/app/(auth)/signup/SignupForm.test.tsx`
- [ ] `src/app/components/LogoutButton.test.tsx`
- [ ] `e2e/auth.spec.ts`
