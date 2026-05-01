# Balikha — Project Plan

A handoff document for resuming this project in Claude Code. Everything below has already been decided. Don't relitigate decisions unless explicitly asked; just execute.

---

## 1. Context

**Balikha** is an artisan marketplace where artisans (sellers) feature and sell their artworks, and buyers browse and purchase. Goal: a working local-development prototype with SEO and speed baked in from day one.

**Repo:** https://github.com/pulidongz/balikha — currently being reset from scratch (an earlier attempt got too complicated too fast).

**Audience for this prototype:** local dev only. No deploy targets, no payments, no email sending yet — those are explicitly out of scope until the seller-side flow works end-to-end.

---

## 2. Tech Stack (locked in)

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Node.js **22.14.0** (pinned) | User requirement |
| Framework | Next.js 15+ (App Router) | SSR + ISR for SEO, built-in image optimization, single codebase |
| Language | TypeScript (strict) | |
| Database | PostgreSQL 16 (Docker) | Relational fit for marketplace data |
| ORM | Drizzle | Lightweight, SQL-honest, fast cold starts |
| Auth | Better Auth | Modern, plugin-based, good Next.js + Drizzle integration |
| Styling | Tailwind + shadcn/ui + CSS Modules | shadcn for primitives, `*.module.css` for custom components |
| Package manager | npm | User preference |
| Tooling | Prettier, ESLint (next config), TypeScript strict | |

---

## 3. Architectural Decisions (locked in)

These have been discussed and decided. Do not re-ask the user.

- **SEO is a first-class concern.** Server-render every public page (product, artisan shop, browse). Per-page metadata, Open Graph, JSON-LD `Product` schema, sitemap, robots.txt.
- **Slugs in URLs**, not IDs. Auto-generated from title at create time. URL shape: `/shop/[artisanSlug]/[productSlug]`. Slugs are unique per artisan (not globally), enforced via composite unique index. On collision within the same artisan, append `-2`, `-3`, etc.
- **No role field on user.** A user becomes a seller by creating an `artisan_profile`. Buyers are just users without one. Authorization derives from ownership of the profile.
- **No product variants in the prototype.** Each product is its own SKU with its own stock, price, images. If an artist wants three glaze colors, they create three products. A nullable `product_group_id` can be added later as a one-line migration if needed.
- **Catalogs are flat, not typed.** No "open vs. limited edition" distinction. A catalog has a `status` (draft/published/archived) and optional `release_at` / `closes_at` timestamps for drops. Artist controls visibility.
- **Money stored as `numeric(10,2)`.** Exact precision in Postgres, no float math. Drizzle returns these as strings — convert at the boundary.
- **Currency stored per product**, default `'PHP'`.
- **`artisan_profile_id` denormalized onto `products`.** Looks redundant (you can join through catalog) but every "show me everything by this artisan" query becomes a one-table read. Indexed.

---

## 4. Domain Schema

### Better Auth tables (managed by Better Auth)

`user`, `session`, `account`, `verification` — text IDs (Better Auth convention). Schema can be auto-generated via `npx @better-auth/cli generate` after the auth config is in place.

### Application tables

```
artisan_profiles
  id                  uuid pk
  user_id             text fk -> user.id (unique, on delete cascade)
  shop_slug           text unique
  shop_name           text
  bio                 text
  banner_image_url    text
  location            text
  policies            text
  created_at, updated_at

catalogs
  id                  uuid pk
  artisan_profile_id  uuid fk (indexed, on delete cascade)
  slug                text   -- unique per artisan (composite unique index)
  title               text
  description         text
  status              enum('draft' | 'published' | 'archived')  default 'draft'
  release_at          timestamp nullable
  closes_at           timestamp nullable
  created_at, updated_at

products
  id                  uuid pk
  catalog_id          uuid fk (indexed, on delete cascade)
  artisan_profile_id  uuid fk (indexed, on delete cascade)  -- denormalized
  slug                text   -- unique per artisan (composite unique index)
  title               text
  description         text
  price               numeric(10,2)
  currency            text default 'PHP'
  stock_on_hand       integer default 0
  status              enum('draft' | 'published' | 'sold_out' | 'archived')  default 'draft'
  dimensions          jsonb     -- {width?, height?, depth?, unit?: 'cm'|'in'}
  materials           text[]
  weight_grams        integer nullable
  created_at, updated_at

product_images
  id                  uuid pk
  product_id          uuid fk (indexed, on delete cascade)
  url                 text
  alt_text            text
  position            integer default 0
  width               integer
  height              integer
```

Cart, orders, reviews are explicitly **not** in this prototype phase.

---

## 5. Project Layout

```
balikha/
├── app/
│   ├── api/
│   │   └── auth/[...all]/route.ts
│   ├── (auth)/
│   │   ├── sign-in/page.tsx
│   │   └── sign-up/page.tsx
│   ├── (marketing)/
│   │   ├── page.tsx                                  # home / browse
│   │   └── shop/[artisanSlug]/
│   │       ├── page.tsx                              # artisan storefront
│   │       └── [productSlug]/page.tsx                # product detail
│   ├── (dashboard)/
│   │   └── dashboard/...
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── ui/                                           # shadcn components
│   └── ...                                           # custom components + *.module.css
├── db/
│   ├── schema/
│   │   ├── auth.ts
│   │   ├── app.ts
│   │   └── index.ts
│   └── index.ts                                      # drizzle client
├── lib/
│   ├── auth.ts                                       # Better Auth server config
│   ├── auth-client.ts                                # Better Auth client SDK
│   └── slug.ts                                       # slug helpers
├── .editorconfig
├── .env.local
├── .nvmrc                                            # 22.14.0
├── .npmrc                                            # engine-strict=true
├── .prettierrc.json
├── .prettierignore
├── docker-compose.yml
├── drizzle.config.ts
├── eslint.config.mjs
├── middleware.ts
├── next.config.ts
├── package.json
└── tsconfig.json
```

---

## 6. Implementation Phases

Each phase should produce a runnable, committable state. Don't merge phases.

### Phase 0 — Reset existing repo

Preserve old work, then nuke working directory.

```bash
git clone https://github.com/pulidongz/balikha.git
cd balikha
git checkout -b archive/v0
git push origin archive/v0
git checkout main
git rm -rf .
git clean -fxd
```

The directory is now empty (except `.git`). Proceed to Phase 1 in this directory.

### Phase 1 — Scaffold + tooling

Create Next.js app and install all deps.

```bash
# scaffolding inside the cleaned directory
npx create-next-app@latest . --ts --tailwind --app --eslint --no-src-dir --import-alias "@/*"

npm install drizzle-orm postgres better-auth
npm install -D drizzle-kit @types/pg \
  prettier prettier-plugin-tailwindcss \
  eslint-config-prettier

npx shadcn@latest init
```

Then create the config files in this section, write the `package.json` scripts and `engines`, run `npm run check` to verify everything's wired up, and commit.

#### `.nvmrc`
```
22.14.0
```

#### `.npmrc`
```
engine-strict=true
```

#### `package.json` additions
```json
{
  "engines": { "node": ">=22.14.0" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "lint:fix": "next lint --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "tsc --noEmit",
    "check": "npm run typecheck && npm run lint && npm run format:check",
    "db:push": "drizzle-kit push",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  }
}
```

#### `.editorconfig`
```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

#### `.prettierrc.json`
```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

#### `.prettierignore`
```
.next
node_modules
drizzle
public
*.lock
package-lock.json
```

#### `eslint.config.mjs`
```js
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  ...compat.extends('prettier'), // must be last
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
];

export default eslintConfig;
```

#### `tsconfig.json` tightening (merge into existing)
```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true
  }
}
```

**Phase 1 done when:** `npm run dev` shows the default Next.js page on `localhost:3000`, `npm run check` passes clean. Commit: `chore: initial scaffold (next.js, tooling, shadcn)`.

### Phase 2 — Database + auth wiring

#### `docker-compose.yml`
```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: balikha_pg
    restart: unless-stopped
    environment:
      POSTGRES_USER: balikha
      POSTGRES_PASSWORD: balikha_dev
      POSTGRES_DB: balikha
    ports:
      - "5432:5432"
    volumes:
      - balikha_pg_data:/var/lib/postgresql/data

volumes:
  balikha_pg_data:
```

#### `.env.local`
```bash
DATABASE_URL="postgres://balikha:balikha_dev@localhost:5432/balikha"
BETTER_AUTH_SECRET="<run: openssl rand -base64 32>"
BETTER_AUTH_URL="http://localhost:3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

#### `drizzle.config.ts`
```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './drizzle',
  schema: './db/schema/index.ts',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

#### `db/schema/auth.ts`
```ts
import { pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at'),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});
```

> **Note for Claude Code:** Better Auth ships a CLI (`npx @better-auth/cli generate`) that introspects the auth config and outputs this schema. After writing `lib/auth.ts` below, you can regenerate this file via the CLI as a sanity check — it should match the version above.

#### `db/schema/app.ts`
```ts
import {
  pgTable, uuid, text, timestamp, integer, numeric, jsonb, pgEnum, index, uniqueIndex,
} from 'drizzle-orm/pg-core';
import { user } from './auth';

export const catalogStatus = pgEnum('catalog_status', ['draft', 'published', 'archived']);
export const productStatus = pgEnum('product_status', ['draft', 'published', 'sold_out', 'archived']);

export const artisanProfiles = pgTable('artisan_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull().unique().references(() => user.id, { onDelete: 'cascade' }),
  shopSlug: text('shop_slug').notNull().unique(),
  shopName: text('shop_name').notNull(),
  bio: text('bio'),
  bannerImageUrl: text('banner_image_url'),
  location: text('location'),
  policies: text('policies'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const catalogs = pgTable('catalogs', {
  id: uuid('id').primaryKey().defaultRandom(),
  artisanProfileId: uuid('artisan_profile_id').notNull().references(() => artisanProfiles.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: catalogStatus('status').notNull().default('draft'),
  releaseAt: timestamp('release_at'),
  closesAt: timestamp('closes_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  artisanIdx: index('catalogs_artisan_idx').on(t.artisanProfileId),
  uniqueSlugPerArtisan: uniqueIndex('catalogs_slug_per_artisan').on(t.artisanProfileId, t.slug),
}));

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  catalogId: uuid('catalog_id').notNull().references(() => catalogs.id, { onDelete: 'cascade' }),
  artisanProfileId: uuid('artisan_profile_id').notNull().references(() => artisanProfiles.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('PHP'),
  stockOnHand: integer('stock_on_hand').notNull().default(0),
  status: productStatus('status').notNull().default('draft'),
  dimensions: jsonb('dimensions').$type<{ width?: number; height?: number; depth?: number; unit?: 'cm' | 'in' }>(),
  materials: text('materials').array(),
  weightGrams: integer('weight_grams'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  catalogIdx: index('products_catalog_idx').on(t.catalogId),
  artisanIdx: index('products_artisan_idx').on(t.artisanProfileId),
  statusIdx: index('products_status_idx').on(t.status),
  uniqueSlugPerArtisan: uniqueIndex('products_slug_per_artisan').on(t.artisanProfileId, t.slug),
}));

export const productImages = pgTable('product_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  altText: text('alt_text'),
  position: integer('position').notNull().default(0),
  width: integer('width'),
  height: integer('height'),
}, (t) => ({
  productIdx: index('product_images_product_idx').on(t.productId),
}));
```

#### `db/schema/index.ts`
```ts
export * from './auth';
export * from './app';
```

#### `db/index.ts`
```ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });
```

#### `lib/auth.ts`
```ts
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '@/db';

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: 'pg' }),
  emailAndPassword: {
    enabled: true,
    autoSignIn: true,
  },
});

export type Session = typeof auth.$Infer.Session;
```

#### `lib/auth-client.ts`
```ts
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
});

export const { signIn, signUp, signOut, useSession } = authClient;
```

#### `app/api/auth/[...all]/route.ts`
```ts
import { auth } from '@/lib/auth';
import { toNextJsHandler } from 'better-auth/next-js';

export const { POST, GET } = toNextJsHandler(auth);
```

#### `middleware.ts`
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';

export async function middleware(request: NextRequest) {
  const sessionCookie = getSessionCookie(request);
  if (!sessionCookie) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*'],
};
```

#### `lib/slug.ts` (helper)
```ts
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// Generates a unique slug by checking against existing slugs and appending -2, -3, etc.
export function uniqueSlug(base: string, existing: Set<string>): string {
  const slug = slugify(base);
  if (!existing.has(slug)) return slug;
  let n = 2;
  while (existing.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}
```

**Phase 2 done when:**
- `docker compose up -d` brings up Postgres
- `npm run db:push` syncs schema cleanly
- `npm run db:studio` shows all tables (auth + app)
- `npm run dev` still loads `localhost:3000`
- `npm run check` passes

Commit: `feat: database schema, drizzle client, better-auth config`.

### Phase 3 — Auth UI

Build sign-up and sign-in pages using shadcn primitives (`button`, `input`, `label`, `card`, `form`). Wire to `authClient.signUp.email()` and `authClient.signIn.email()`. Redirect to `/dashboard` on success. Sign-out button somewhere visible (header or dashboard).

Manual test path:
1. `/sign-up` → create account → land on `/dashboard`
2. Sign out → land on home
3. `/sign-in` → log back in
4. Hit `/dashboard` while signed out → redirected to `/sign-in` (middleware works)

Commit: `feat: sign-up, sign-in, sign-out flow`.

### Phase 4 — "Become a seller" flow

Server action: given an authenticated user, create an `artisan_profile` (collect `shop_name`, generate `shop_slug` via `lib/slug.ts`, ensure global uniqueness on `shop_slug`). Auto-create one default catalog (`title: "Shop"`, `slug: "shop"`, `status: 'draft'`).

Dashboard should detect: does this user have an artisan profile? If no, show "Become a seller" form. If yes, show seller dashboard.

Authorization helper in `lib/auth-helpers.ts`:
```ts
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { db } from '@/db';
import { artisanProfiles } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function getCurrentArtisanProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const [profile] = await db
    .select()
    .from(artisanProfiles)
    .where(eq(artisanProfiles.userId, user.id))
    .limit(1);
  return profile ?? null;
}
```

Commit: `feat: become-a-seller flow + artisan profile`.

### Phase 5 — Seller dashboard: catalogs and products

Within `/dashboard`:
- List catalogs with create/edit/archive actions
- Within a catalog: list products, create/edit/publish/archive
- Product create form: title, description, price, currency (default PHP), stock, materials (chips/tags input), dimensions, weight
- Product images: local upload to `public/uploads/<artisan-id>/<product-id>/` for now. Use Next.js `<Image>` everywhere downstream.

All slugs auto-generated from title; never expose to the artist.

All mutations must verify the authenticated user owns the `artisan_profile` the resource belongs to. Use the helper in Phase 4.

Commit: `feat: seller dashboard - catalog and product CRUD`.

### Phase 6 — Public storefront with SEO

Public, server-rendered pages:
- `/shop/[artisanSlug]` — artisan storefront, lists their published products
- `/shop/[artisanSlug]/[productSlug]` — product detail page

Use Next.js `generateMetadata` for per-page `<title>`, `description`, Open Graph tags. The product's primary image is the OG image. Inject JSON-LD `Product` schema in the product page (`schema.org` Product + Offer).

ISR: revalidate product pages on a timer (e.g., `revalidate: 300`) and on-demand when the artist edits.

Add `app/sitemap.ts` and `app/robots.ts`. Sitemap pulls all published artisans and products from the DB.

Commit: `feat: public storefront pages with full SEO`.

### Phase 7 — Browse / home

Home page lists recent published products across all artisans. Basic filters by category later — for now, just a paginated grid.

Commit: `feat: browse / home page`.

### Phase 8 (deferred) — Cart, checkout, orders, payments

Not part of this prototype. Document only — don't build.

---

## 7. Conventions

- **Server components by default.** Add `"use client"` only when interaction or React hooks demand it (forms, dropdowns).
- **Server actions for mutations**, not API routes. API routes only for the Better Auth handler.
- **All money formatting** goes through one `formatPrice(value: string, currency: string)` helper. Drizzle returns `numeric` as string — never coerce to `Number` for arithmetic; if math is needed, use `decimal.js` or convert to integer cents at the boundary.
- **Image uploads** save with stable paths; record width/height on `product_images` so the `<Image>` component can avoid layout shift.
- **Authorization in mutations** always re-fetches the resource server-side and checks ownership against the current session. Never trust IDs from the client.
- **No `any`.** If you reach for it, that's the signal to define a real type.

---

## 8. Out of scope for this prototype

Don't build any of these unless asked:
- Email verification, password reset, magic links, social login
- Cart, checkout, orders, payments
- Reviews, ratings, messaging
- Search beyond simple DB queries
- Image hosting beyond local `public/uploads`
- Deployment configuration
- Tests (we'll add Vitest + Playwright later, separately)

---

## 9. Quick start for Claude Code

Run these in order on a fresh checkout:

```bash
nvm use                  # picks up .nvmrc → 22.14.0
docker compose up -d
npm install
npm run db:push
npm run dev
```

If `npm run check` doesn't pass, fix it before adding new features. Don't accumulate lint/type debt.

---

## 10. Open question to ask the user before Phase 2

The `BETTER_AUTH_SECRET` in `.env.local` needs to be generated locally with `openssl rand -base64 32`. Don't commit a real one. Either prompt the user to do it, or add a script in `package.json` that prints the command.

Otherwise: every decision in §3 has been made. Don't re-ask.
