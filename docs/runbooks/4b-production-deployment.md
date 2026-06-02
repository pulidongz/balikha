# 4B — Production Application Deployment Runbook

**Scope:** Deploy the Balikha Next.js application to the 4A-provisioned $5 / 1 GB
Linode. After completing this runbook the app serves on `https://balikha.art`
over a valid Let's Encrypt TLS certificate, product images load from Cloudflare
R2, and `orders:tick` runs hourly via a systemd timer.

**4B↔4E boundary:** The apex `balikha.art` A record stays **DNS-only (grey
cloud)** so Let's Encrypt HTTP-01 works on the box. Cloudflare proxying / WAF
in front of the app is 4E — do not enable the orange cloud during this runbook.

---

## Prerequisites

Before starting, confirm:

- [ ] The box is **provisioned and verified** per `docs/runbooks/4a-host-provisioning.md`
      (PostgreSQL 16 running, `deploy` user with NOPASSWD sudo, firewall open on 22/80/443).
- [ ] **`balikha.art` is hosted on Cloudflare** — nameservers must point to
      Cloudflare so you can attach an R2 custom domain and manage DNS records.
- [ ] **Apex A record:** `balikha.art` → box public IPv4, **DNS-only (grey cloud)**.
      Caddy uses HTTP-01 on port 80 for Let's Encrypt issuance; a proxied record
      blocks HTTP-01.
- [ ] **`www` A record (required if you keep the `www.balikha.art` redirect block
      in the Caddyfile):** add a grey-cloud `www.balikha.art` A record pointing to
      the same box IP. Caddy obtains a **separate** Let's Encrypt cert for `www`;
      if the DNS record is absent, Caddy will retry ACME indefinitely and log errors
      that look like a failure. Either add the record or remove the `www` block from
      `infra/production/Caddyfile` before this runbook.
- [ ] **Cloudflare R2 API token:** created in R2 → Manage API Tokens (Object Read
      & Write, scoped to `balikha-prod`). Note the Access Key ID and Secret.
- [ ] **R2 custom domain:** `images.balikha.art` connected to the `balikha-prod`
      bucket; public read enabled via the custom domain.
- [ ] **R2 CORS:** `PUT` from `https://balikha.art` allowed on the `balikha-prod`
      bucket (browser presigned uploads).
- [ ] **Resend production API key** for the verified `balikha.art` sending domain.
- [ ] `DB_PASSWORD` retrievable from your secrets manager (set during 4A's
      `80-postgres.sh`).
- [ ] `gh` CLI authenticated (`gh auth status`) — needed to trigger and download
      the release workflow artifact.

---

## Step 1 — Provision the app runtime

Copy the provisioning scripts to the box (or reuse the copy from 4A if it is
still present at `/root/provision`):

```bash
scp -r infra/provision root@<public-ip>:/root/provision
```

SSH in as root and run the app-runtime step:

```bash
ssh root@<public-ip>
sudo /root/provision/90-app-runtime.sh
```

This script (idempotent — safe to re-run):

1. Creates the `balikha-app` system user with home `/var/lib/balikha`.
2. Installs Node.js 22.x from NodeSource (asserts version ≥ 22.14.0).
3. Installs Caddy from the official Cloudsmith apt repo.
4. Creates `/opt/balikha/releases` (owned `balikha-app:balikha-app`).
5. Installs the systemd units to `/etc/systemd/system/` and enables
   `balikha.service` + `balikha-orders-tick.timer` (does **not** start them —
   no release is on disk yet).
6. Installs `infra/production/Caddyfile` to `/etc/caddy/Caddyfile`, validates
   it, and starts/reloads Caddy.

Run the full verify script to confirm 4A **and** 4B provisioning:

```bash
sudo /root/provision/99-verify.sh
```

Expected output: every check prints `PASS:` and the script exits with
`ALL CHECKS PASSED.`

---

## Step 2 — Write `/etc/balikha/production.env`

The env file holds all runtime secrets. **Never write secrets to shell history.**
Use a heredoc or your preferred no-echo method.

On the box (as root or via sudo):

```bash
# 1. Open an editor — this keeps secrets out of shell history entirely.
sudo nano /etc/balikha/production.env
```

Paste the contents of `.env.production.example` (from the repo root) and fill in
every `<...>` placeholder:

| Variable               | How to get the value                                          |
| ---------------------- | ------------------------------------------------------------- |
| `DB_PASSWORD`          | From your secrets manager (set during 4A's `80-postgres.sh`)  |
| `BETTER_AUTH_SECRET`   | Generate: `openssl rand -base64 32`                           |
| `S3_ACCESS_KEY_ID`     | From the R2 API token created in prerequisites                |
| `S3_SECRET_ACCESS_KEY` | Same token                                                    |
| `RESEND_API_KEY`       | From your Resend dashboard                                    |
| All other vars         | Exact values from `.env.production.example` (no placeholders) |

After filling in the file:

```bash
sudo chmod 600 /etc/balikha/production.env
sudo chown balikha-app:balikha-app /etc/balikha/production.env
```

**No dev credentials, no MinIO endpoints, no `localhost` values.** Every URL
must be the live production value.

> **⚠️ Do NOT run `db:seed` in production.** Production starts with an empty
> `product_images` table so every image URL is minted against
> `images.balikha.art`. Seeding (or any inherited dev rows) would persist
> `localhost`/MinIO URLs that render broken with no rewrite path — image URLs
> are denormalized at upload (`db/schema/app.ts:168`). The deploy runs only
> `db:migrate` (schema), never the seed.

---

## Step 3 — First deploy

### 3a. Trigger the Release build workflow

From your workstation (in the repo directory):

```bash
gh workflow run release.yml
```

Wait for the run to complete and note its run ID:

```bash
gh run list --workflow=release.yml --limit=5
```

### 3b. Download the artifact

```bash
gh run download <run-id>
```

This downloads a directory named `balikha-deploy-<sha>` containing
`balikha-deploy-<sha>.tar.gz`.

### 3c. Run the deploy script

```bash
infra/production/deploy.sh deploy@<public-ip> ./balikha-deploy-<sha>/balikha-deploy-<sha>.tar.gz
```

The script:

1. Ships the artifact to the box via `scp`.
2. Extracts to `/opt/balikha/releases/<timestamp>`.
3. Asserts `.env.development` is absent in the release (would override `DATABASE_URL`).
4. Runs `npm ci` as `balikha-app` with `HOME=/var/lib/balikha` (npm cache lands in the app user's home).
5. Asserts `node_modules/.bin/tsx` and `node_modules/.bin/drizzle-kit` exist
   (devDeps are required for migrate and tick).
6. Flips `/opt/balikha/current` symlink to the new release.
7. Runs `balikha-migrate.service` (oneshot — blocks and returns its exit status; fails loudly on migration error).
8. Restarts `balikha.service`.
9. Enables `balikha-orders-tick.timer` (`--now` starts it if not already running).
10. **Hard loopback health gate:** `curl -fsS --retry 10 --retry-delay 2 http://127.0.0.1:3000/api/health` — fails the deploy if the app is not healthy on the box.
11. **Soft public-URL check:** `curl https://balikha.art/api/health` — warns but does not fail (Let's Encrypt issuance may still be in progress on a first deploy).
12. Prunes old releases, keeping the newest 5.
13. Prints a rollback hint.

---

## Step 4 — Verify the 4 acceptance criteria

### AC1 — App serves on the production domain over valid public TLS

```bash
# From your workstation:
curl -I https://balikha.art
# Expected: HTTP/2 200 with a valid Let's Encrypt certificate (not self-signed).

curl https://balikha.art/api/health
# Expected: {"status":"ok"}
```

> **First-deploy note (Issue 13):** On the first deploy, allow a few minutes
> for Let's Encrypt HTTP-01 issuance. If the public URL briefly 404s or refuses
> connections, confirm the app is running on the box first:
>
> ```bash
> ssh deploy@<public-ip> 'curl -fsS http://127.0.0.1:3000/api/health'
> # Expected: {"status":"ok"}
> ```
>
> Then watch Caddy's ACME progress:
>
> ```bash
> ssh deploy@<public-ip> 'sudo journalctl -u caddy -f'
> ```
>
> Look for lines mentioning the certificate being obtained. Once ACME completes,
> `curl -I https://balikha.art` will start returning 200 with a valid cert.
> A brief delay here is normal and is **not** a deploy failure — the hard
> loopback gate in the deploy script already confirmed the app process is up.

### AC2 — Product images load from Cloudflare R2

1. Log in to the dashboard as a seller at `https://balikha.art`.
2. Upload a product image.
3. Confirm the image URL begins with `https://images.balikha.art/...`.
4. Open the URL directly in a browser — it must load.

### AC3 — `orders:tick` runs automatically on a schedule

```bash
ssh deploy@<public-ip> 'systemctl list-timers balikha-orders-tick.timer'
# Expected: timer listed, ACTIVATES balikha-orders-tick.service, next trigger shown.

# After a tick fires (wait up to 1 hour, or check shortly after deploy):
ssh deploy@<public-ip> 'sudo journalctl -u balikha-orders-tick.service'
# Expected: log entries showing the tick ran (even if it processed 0 rows on
# an empty DB — that is correct behaviour).
```

> **Expected behaviour at deploy time (Issue 14):** `Persistent=true` in the
> timer means enabling it (as the deploy script does with `--now`) can fire one
> catch-up tick **immediately**. A journal entry for `balikha-orders-tick.service`
> right at deploy time is expected, not a fault. The tick is idempotent and
> no-ops on empty result sets.

### AC4 — No dev credentials or internal CA in production config

```bash
ssh deploy@<public-ip> bash -s <<'EOF'
echo "=== Caddy config (no 'tls internal', no 'localhost') ==="
grep -Ei 'tls internal|localhost|minio|balikha_dev' /etc/caddy/Caddyfile \
  && echo "FAIL: dev config found" || echo "PASS: no dev config"

echo "=== Env file: prod S3 endpoint present ==="
sudo grep -q 'r2.cloudflarestorage.com' /etc/balikha/production.env \
  && echo "PASS: prod S3 endpoint found" \
  || echo "FAIL: prod S3 endpoint not set"
echo "=== Env file: no dev MinIO (localhost:9000) endpoint ==="
sudo grep -Ei 'localhost:9000|127\.0\.0\.1:9000' /etc/balikha/production.env \
  && echo "FAIL: dev S3 endpoint detected" \
  || echo "PASS: no dev S3 endpoint"
EOF
```

Expected output: both checks print `PASS:`.

---

## Step 5 — Rollback

> **⚠️ Code-only rollback — safe ONLY when the rolled-back release ran no schema
> migration.**

The deploy script retains the newest 5 releases at `/opt/balikha/releases/`.
To roll back to the previous release:

```bash
ssh deploy@<public-ip> 'ls -1dt /opt/balikha/releases/*/'
# Note the second-most-recent release path, e.g. /opt/balikha/releases/20260601120000
```

```bash
ssh deploy@<public-ip> 'sudo ln -sfn /opt/balikha/releases/<previous-ts> /opt/balikha/current \
  && sudo systemctl restart balikha.service'
```

Confirm the app is healthy on loopback after the rollback:

```bash
ssh deploy@<public-ip> 'curl -fsS http://127.0.0.1:3000/api/health'
```

> **⚠️ Schema-migration caveat:** Because Drizzle migrations are forward-only
> and database backups are deferred to 4D, rolling code back **after** a release
> that ran a schema migration leaves the database schema ahead of the code. This
> can cause data-integrity errors or runtime failures.
>
> - **Pre-launch (database is empty):** rebuild the host from scratch using the
>   4A runbook, then re-run this runbook. This is the safest option while there
>   is no real user data.
> - **Post-4D (database backups exist):** use the 4D backup/restore path to
>   restore the database to the state before the migration, then repoint the
>   symlink.
>
> **Do not use this code-only rollback after a schema migration** unless you
> have verified that the rolled-back code is compatible with the current (newer)
> schema.

---

## Step 6 — Roadmap note

On successful completion of all 4 ACs, mark **4B** as done in
`docs/plans/balikha-roadmap.md`:

- Change `### [ ] 4B` → `### [x] 4B`
- Set `Status:` to `done`

Then tick 4B in `docs/plans/balikha-roadmap.md` and commit the update.
