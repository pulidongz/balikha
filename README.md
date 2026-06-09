# Balikha

[![CI](https://github.com/pulidongz/balikha/actions/workflows/ci.yml/badge.svg)](https://github.com/pulidongz/balikha/actions/workflows/ci.yml)

An artisan marketplace where independent makers list and sell handmade work. Built as a working local prototype with SEO and speed baked in.

## Tech stack

| Layer          | Choice                                                              |
| -------------- | ------------------------------------------------------------------- |
| Runtime        | Node.js 22.14.0 (pinned via `.nvmrc`, enforced via `engine-strict`) |
| Framework      | Next.js 16 (App Router, React 19, Turbopack)                        |
| Database       | PostgreSQL 16 (Docker) + Drizzle ORM                                |
| Auth           | Better Auth (email + password)                                      |
| Object storage | MinIO locally, Cloudflare R2 in production (S3-compatible)          |
| Styling        | Tailwind v4 + shadcn/ui (with `@base-ui/react`)                     |
| Validation     | Zod schemas in `lib/validators/`                                    |
| Logging        | Pino (structured)                                                   |

---

## Prerequisites

- **Node.js 22.14.0** — `nvm use` will pick it up from `.nvmrc`.
- **Docker** — for Postgres + MinIO containers.
- **npm** — package manager.

---

## First-time setup

```bash
# 1. Use the pinned Node version
nvm use

# 2. Install JS deps
npm install

# 3. Create .env.development from the template
cp .env.example .env.development

# 4. Generate a real BETTER_AUTH_SECRET and edit it into .env.development
openssl rand -base64 32
# (paste the output into BETTER_AUTH_SECRET in .env.development)

# 5. Bring up Postgres + MinIO + Caddy (TLS reverse proxy)
docker compose up -d

# 6. Trust Caddy's local root CA (one-time) — runs the steps in the
#    "Local HTTPS / certificates" section below. Asks for your password.
./bin/trust-cert

# 7. Apply the database schema
npm run db:migrate

# 8. Seed deterministic test data (21 users + 200 products + ~455 MinIO images)
npm run db:seed

# 9. Start the dev server
npm run dev
```

Open <https://balikha.localhost:8443>.

`balikha.localhost` resolves to 127.0.0.1 automatically (RFC 6761), so no `/etc/hosts` editing. Caddy terminates TLS on `:8443` and proxies to the Next dev server on `:3000`. You can also reach the dev server directly at <http://localhost:3000> — useful for quick curl tests where TLS is in the way.

---

## Local HTTPS / certificates

The `caddy` container generates its own root CA on first boot and mints a leaf cert for `balikha.localhost`. The CA is **not trusted by macOS by default**, so the browser shows a warning the first time you visit. Trusting it is a one-time step.

### Install (script — recommended)

```bash
./bin/trust-cert
```

That script extracts the CA from the running `balikha_caddy` container, checks whether it's already in the System keychain (idempotent — safe to re-run), and runs `sudo security add-trusted-cert` if needed. Verifies with `curl` afterwards. Run it again any time `docker compose down -v` wipes the caddy volume — Caddy regenerates a new CA, the script detects the fingerprint mismatch and re-trusts.

### Install (manual CLI)

If you'd rather see exactly what the script runs, the equivalent two commands:

```bash
docker exec balikha_caddy cat /data/caddy/pki/authorities/local/root.crt > /tmp/balikha-caddy-root.crt
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain /tmp/balikha-caddy-root.crt
```

### Install (GUI alternative)

If you'd rather not use `sudo` from the terminal:

```bash
docker exec balikha_caddy cat /data/caddy/pki/authorities/local/root.crt > /tmp/balikha-caddy-root.crt
open /tmp/balikha-caddy-root.crt
```

Keychain Access opens with the certificate selected. Expand **Trust** → set **When using this certificate** to **Always Trust** → close the window. macOS prompts for your login password to save the change.

### Verify it worked

```bash
curl -sS -o /dev/null -w "status=%{http_code}\n" https://balikha.localhost:8443/
# Expected: status=200 (no -k flag needed)
```

If you get a TLS error: the cert isn't trusted yet, or it was extracted from a stale container. Re-run the extract step.

In the browser: open <https://balikha.localhost:8443> in a fresh tab — the address bar should show a closed padlock with no warning. **Restart the browser if you trusted the cert while it was already open** — Chrome and Firefox cache trust decisions per-process.

### Re-extracting after `docker compose down -v`

`docker compose down -v` deletes the `balikha_caddy_data` volume, which wipes the CA. Next time Caddy boots it generates a brand new CA — and the one you trusted earlier is no longer valid. Symptoms: padlock icon turns red, `curl` fails with `unable to get local issuer certificate`.

Fix:

```bash
# Remove the old (now-orphaned) trust entry
sudo security delete-certificate -c "Caddy Local Authority - 2026 ECC Root" \
  /Library/Keychains/System.keychain
# (the year + suffix may differ — check Keychain Access for the exact name)

# Re-extract + re-trust the new CA
docker exec balikha_caddy cat /data/caddy/pki/authorities/local/root.crt > /tmp/balikha-caddy-root.crt
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain /tmp/balikha-caddy-root.crt
```

To **avoid** this: don't `docker compose down -v`. Use `docker compose stop` (preserves volumes) or `docker compose down` (removes containers but keeps volumes).

### Removing trust (uninstall)

```bash
sudo security delete-certificate -c "Caddy Local Authority - 2026 ECC Root" \
  /Library/Keychains/System.keychain
```

Or open Keychain Access → search "Caddy Local Authority" → right-click → Delete.

### What about Linux / WSL / Windows?

Same `docker exec ... cat root.crt` first step. Then:

- **Linux**: `sudo cp /tmp/balikha-caddy-root.crt /usr/local/share/ca-certificates/balikha-caddy-root.crt && sudo update-ca-certificates`
- **Firefox** (any OS): Firefox uses its own trust store. Settings → Privacy & Security → Certificates → View Certificates → Authorities → Import → check "Trust this CA to identify websites".
- **Windows**: `certutil -addstore "Root" C:\path\to\root.crt` (PowerShell as Admin) or run `certmgr.msc` → Trusted Root Certification Authorities → Import.

---

## Day-to-day commands

| Need to…                              | Command                                                  |
| ------------------------------------- | -------------------------------------------------------- |
| Start dev server                      | `npm run dev`                                            |
| Type-check + lint + format            | `npm run check`                                          |
| Auto-format                           | `npm run format`                                         |
| Auto-fix lint                         | `npm run lint:fix`                                       |
| Inspect DB visually                   | `npm run db:studio` (opens https://local.drizzle.studio) |
| Reset DB (wipe + reseed)              | `npm run db:reset`                                       |
| Just reseed (preserves schema)        | `npm run db:seed`                                        |
| Apply a schema change                 | `npm run db:generate && npm run db:migrate`              |
| Quick schema sync (dev-only shortcut) | `npm run db:push`                                        |
| Stop services (keeps data)            | `docker compose stop`                                    |
| Restart services                      | `docker compose start`                                   |

⚠️ `docker compose down -v` deletes the named volumes — that's the **nuclear** option that wipes the DB and all uploaded objects.

---

## Test credentials

`npm run db:seed` creates 21 accounts: 1 admin, 10 sellers, 10 buyers. Plus 200 products (20 per seller) with ~455 real images uploaded to MinIO. The credentials print at the end of every seed run.

| Role                                | Email                                        | Password      |
| ----------------------------------- | -------------------------------------------- | ------------- |
| **Admin** (no shop)                 | `admin@balikha.art`                          | `password123` |
| Seller — Maria Ceramics (pottery)   | `maria@balikha.art`                          | `password123` |
| Seller — T'boli Weaves              | `tboli@balikha.art`                          | `password123` |
| Seller — Narra Studio (wood)        | `narra@balikha.art`                          | `password123` |
| Seller — Kapinunan Silver           | `kapinunan@balikha.art`                      | `password123` |
| Seller — Pasig Leatherworks         | `pasig-leather@balikha.art`                  | `password123` |
| Seller — Banwa Glass                | `banwa-glass@balikha.art`                    | `password123` |
| Seller — Davao Dipping Co. (soap)   | `davao-dipping@balikha.art`                  | `password123` |
| Seller — Hablon Heritage (textiles) | `hablon@balikha.art`                         | `password123` |
| Seller — Lola Letras (paper)        | `lola-letras@balikha.art`                    | `password123` |
| Seller — Sagada Roasters (coffee)   | `sagada-roasters@balikha.art`                | `password123` |
| Buyers (10)                         | `buyer1@balikha.art` … `buyer10@balikha.art` | `password123` |

⚠️ Dev-only credentials. Sign in at <https://balikha.localhost:8443/sign-in>.

**Seed timing:** the first run takes ~30s because it fetches a pool of 50 placeholder photos from picsum.photos (cached to `/tmp/balikha-seed-images/`). Re-runs are ~8s — bucket-clear, DB-clear, then upload-from-cache.

---

## Service ports + consoles

| Service           | URL                                                        | Credentials                          |
| ----------------- | ---------------------------------------------------------- | ------------------------------------ |
| App (HTTPS)       | <https://balikha.localhost:8443>                           | use seeded test accounts             |
| App (direct)      | <http://localhost:3000>                                    | bypasses Caddy/TLS — for curl tests  |
| Caddy             | reverse-proxies :8443 → host.docker.internal:3000          | —                                    |
| Postgres          | `localhost:5432`                                           | `balikha` / `balikha_dev`            |
| MinIO S3 API      | `localhost:9000`                                           | `balikha_dev` / `balikha_dev_secret` |
| MinIO web console | <http://localhost:9001>                                    | same as above                        |
| Drizzle Studio    | <https://local.drizzle.studio> (after `npm run db:studio`) | —                                    |

The MinIO bucket `balikha-images` is created automatically by the `minio-init` container on `docker compose up`. It's set to public-read in dev — **production reads go through signed URLs / Cloudflare-fronted R2 and never replicate this anonymous-access setup.**

---

## Project layout

```
app/
  (marketing)/      → public pages: /, /shop/[artisanSlug], /shop/[artisanSlug]/[productSlug]
  (auth)/           → /sign-in, /sign-up
  (dashboard)/      → /dashboard, /dashboard/catalogs/..., /dashboard/settings, /dashboard/become-seller
  api/auth/         → Better Auth handler
  sitemap.ts, robots.ts

components/
  layout/           → SiteHeader, SiteFooter, DashboardShell, etc.
  marketplace/      → ProductCard, ArtisanCard, PriceTag, EmptyState, ...
  dashboard/        → Forms + uploaders for the seller dashboard
  ui/               → shadcn primitives
  auth/             → Sign-in / sign-up / sign-out forms

db/
  schema/           → Drizzle table definitions (auth + app)
  seed/             → npm run db:seed entrypoint
  index.ts          → Drizzle client

lib/
  actions/          → server actions (artisan, catalog, product), all return Result<T>
  validators/       → Zod schemas (single source of truth for input shape)
  storage/          → S3 client (works for MinIO + R2 unchanged)
  auth.ts           → Better Auth server config
  auth-client.ts    → Better Auth React client
  auth-helpers.ts   → getCurrentUser, requireArtisan, requireOwnership, error classes
  result.ts         → Result<T> + ok/err helpers
  logger.ts         → pino instance
  format.ts         → formatPrice
  slug.ts           → slugify, uniqueSlug
  utils.ts          → cn (shadcn helper)

env.ts              → @t3-oss/env-nextjs typed env validator
proxy.ts            → Next 16 proxy (formerly middleware) — gates /dashboard/*
docker-compose.yml  → Postgres + MinIO + minio-init
```

Plans live in `docs/plans/` (gitignored — they're handoff docs kept local).

---

## Common gotchas

- **`Invalid environment variables`** at boot → check `.env.development` against `.env.example`. Most often missing `BETTER_AUTH_SECRET` (must be ≥ 32 chars).
- **Dev server says "Another next dev server is already running"** → `ps aux | grep next-server`, then `kill -9 <pid>`. The detection is filesystem-based and survives crashes.
- **Port 5432 / 9000 already in use** → another container or local Postgres/MinIO is running. `docker ps` to find it; `docker stop <name>` or change the host port mapping in `docker-compose.yml`.
- **`docker compose down` then up didn't bind ports** → if a previous `up` failed mid-way, `docker compose down && docker compose up -d` recreates the container with proper port mappings.

---

## Conventions worth knowing

- Server actions return `Result<T>` from `lib/result.ts`. Forms switch on `result.ok`. Validation field errors flow through `result.fieldErrors` straight from `parsed.error.flatten().fieldErrors`.
- Authorization: load the resource yourself, then `requireOwnership(resource, profile.id)`. Hot paths use a single-`UPDATE`-with-ownership query (IDOR-safe, no separate load).
- Money is stored as `numeric(10,2)` strings. `formatPrice(price, currency)` is the only place that converts to a number — never use `Number(price)` for arithmetic.
- Read env via `@/env`, never `process.env` (except `drizzle.config.ts`, which runs outside Next).
- Log via `logger`, never `console.log` (lint-enforced; `console.warn` and `console.error` are allowed for emergencies).
- Storage keys live under `products/<id>/<uuid>.<ext>` and `uploads/artisans/<id>/...`. Filenames are server-generated UUIDs — never trust client-supplied names.
