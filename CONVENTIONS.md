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
