# 4E — Cloudflare Edge Protection Runbook

**Scope:** Put `balikha.art` behind Cloudflare's free-tier edge: proxied DNS
(origin IP hidden), TLS via a Cloudflare Origin Certificate with edge SSL
**Full (strict)**, the origin firewall locked to Cloudflare's IP ranges, Bot
Fight Mode, a WAF rate-limit rule on auth endpoints, static-asset caching, and
"Under Attack" mode as a manual lever. After this runbook, the four #22 ACs
hold.

**Boundary:** 4E only touches the apex `balikha.art` and `www.balikha.art`.
`images.balikha.art` is an R2 custom domain and is already proxied — do not
change it. Do not change the deploy pipeline (4D) or backups.

> **⚠️ Order matters.** The cutover keeps the still-valid Let's Encrypt cert
> serving Cloudflare↔origin during the DNS flip, then swaps to the Origin
> Certificate, then locks the firewall. Doing these out of order breaks TLS or
> locks you out of the box. Follow the steps in order.

---

## Prerequisites

- [ ] The 4E PR (Caddyfile + scripts + this runbook + app IP changes) is
      **merged to `main`** and the app-code changes have auto-deployed
      (verify `https://balikha.art/api/health` → `{"status":"ok"}`). The
      Caddyfile/firewall changes are inert until Step 3/5 below.
- [ ] `balikha.art` is on Cloudflare (nameservers point to Cloudflare) — true
      since 4B.
- [ ] You can reach the box: `ssh deploy@104.64.213.188`.
- [ ] **Linode LISH console access** confirmed (the lockout recovery path).
- [ ] The latest `infra/` tree is on the box (re-ship if stale):
      `scp -r infra root@104.64.213.188:/root/balikha-infra`

---

## Step 1 — Generate the Cloudflare Origin Certificate

Cloudflare dashboard → **SSL/TLS → Origin Server → Create Certificate**:

- Key type: RSA (2048) or ECDSA — either is fine.
- Hostnames: **`balikha.art` AND `*.balikha.art`** (the wildcard covers `www`).
- Validity: **15 years**.
- Create. Copy the **Origin Certificate** (PEM) and the **Private Key** (shown
  once — save it to the password manager immediately).

Place both on the box (root-owned, 600):

```bash
# On your workstation — write the two files locally first (no secrets in shell
# history: paste into an editor), then ship them:
#
# The cert is public material — scp is fine.
scp cloudflare-origin.pem root@104.64.213.188:/etc/caddy/cloudflare-origin.pem
# The private key is written atomically with umask 077 so it is never
# world-readable even for an instant (no brief open-permissions window).
ssh root@104.64.213.188 'umask 077; cat > /etc/caddy/cloudflare-origin-key.pem' < cloudflare-origin-key.pem
ssh root@104.64.213.188 'getent group caddy >/dev/null && grp=caddy || grp=root; chown "root:$grp" /etc/caddy/cloudflare-origin.pem /etc/caddy/cloudflare-origin-key.pem; chmod 640 /etc/caddy/cloudflare-origin.pem; chmod 600 /etc/caddy/cloudflare-origin-key.pem'
```

> Caddy runs as the `caddy` user; if that group exists, `640`/`root:caddy`
> lets Caddy read the cert while keeping the key tight. If there is no `caddy`
> group, Caddy runs as root via systemd — `root:root` + `640`/`600` is fine.
> The script in Step 5 (`verify-edge.sh`) confirms both files are present.

**Verify the cert covers the wildcard/www SAN before continuing:**

```bash
ssh root@104.64.213.188 'openssl x509 -in /etc/caddy/cloudflare-origin.pem -noout -text | grep -A1 "Subject Alternative Name"'
# Expected output includes: DNS:*.balikha.art (or DNS:www.balikha.art)
# If neither appears, the cert was generated with only the apex — regenerate
# it with both hostnames before proceeding.
```

Delete the local key copy afterward: `rm cloudflare-origin.pem cloudflare-origin-key.pem`.

---

## Step 2 — Set edge SSL mode to Full (strict)

Cloudflare dashboard → **SSL/TLS → Overview → Configure → Full (strict)**.

This is safe to set now while still grey-cloud: the box currently serves a
publicly-valid Let's Encrypt cert, so Full (strict) will validate once traffic
is proxied in Step 3, and will continue to validate after the Origin Cert swap
in Step 4.

---

## Step 3 — Flip DNS to proxied (orange cloud)

Cloudflare dashboard → **DNS → Records**:

- `balikha.art` A record → toggle **Proxied (orange cloud)**.
- `www.balikha.art` A record → toggle **Proxied (orange cloud)**. (Add it if
  absent: A → box IP → proxied.)

Within a minute, confirm traffic now flows through Cloudflare and TLS still
works (origin is still on the LE cert at this point — that's expected):

```bash
dig +short balikha.art          # Expect Cloudflare IPs (104.x / 172.64.x), NOT 104.64.213.188
curl -sI https://balikha.art | grep -i -E 'server|cf-ray'   # Expect: server: cloudflare, a cf-ray header
curl -fsS https://balikha.art/api/health                    # Expect: {"status":"ok"}
```

> If TLS errors here, revert: set the records back to **DNS-only (grey)**.
> Nothing else has changed yet, so grey-cloud restores the prior working state.

---

## Step 4 — Swap Caddy to the Origin Certificate

The merged Caddyfile already references the Origin Cert and trusts Cloudflare's
ranges. Install it via the (idempotent) provisioning step, which validates and
reloads Caddy:

```bash
ssh root@104.64.213.188
sudo /root/balikha-infra/provision/90-app-runtime.sh
```

Expected: `Caddyfile validated.` then a Caddy reload. Now Cloudflare↔origin
uses the Origin Cert (Full strict still validates — Cloudflare trusts its own
origin CA), and `X-Real-IP` becomes the real visitor IP.

Confirm:

```bash
curl -fsS https://balikha.art/api/health    # {"status":"ok"} through Cloudflare
sudo journalctl -u caddy -n 30 --no-pager   # no cert/validation errors
```

**Positively confirm ACME is gone** (the whole point of 4E — no Let's Encrypt
time-bomb left behind). After the reload there must be NO new certificate
activity:

```bash
sudo journalctl -u caddy --since "10 min ago" --no-pager | grep -iE 'obtaining certificate|acme|trying to solve challenge' \
  && echo "PROBLEM: Caddy is still attempting ACME — investigate before locking the firewall" \
  || echo "OK: no ACME activity"
grep -nE '^[[:space:]]*email[[:space:]]' /etc/caddy/Caddyfile \
  && echo "PROBLEM: ACME email directive still present" \
  || echo "OK: no ACME email directive"
```

Both must print `OK:`. If either shows `PROBLEM`, fix it **before** Step 5 —
a stray ACME attempt would fail silently once port 80 is locked to Cloudflare.

> If Caddy fails to reload (e.g. cert path/permissions), it keeps the previous
> config running. Fix the cert files (Step 1) and re-run `90-app-runtime.sh`.

---

## Step 5 — Lock the origin firewall to Cloudflare

Only now that traffic is proxied and the Origin Cert is live:

```bash
ssh deploy@104.64.213.188
sudo /opt/balikha/current/infra/production/lock-origin-firewall.sh
sudo /opt/balikha/current/infra/production/verify-edge.sh
```

> `lock-origin-firewall.sh` is also at `/root/balikha-infra/production/` if you
> shipped the infra tree there. It only changes 80/443; SSH/22 is untouched.

`verify-edge.sh` must end with `ALL EDGE CHECKS PASSED.` Note its scope: it
validates **origin-side** state only (cert, Caddy config, firewall lock,
loopback health) — it does **not** prove the public site serves end-to-end
through Cloudflare. That evidence is AC1/AC2/AC4 in Step 7. If it fails the
"no broad Anywhere allow" or "SSH still allowed" check, see Rollback.

> **Load-bearing invariant (keep it true):** the app trusts `X-Real-IP`
> unconditionally for logging and Better Auth session IPs. That is safe ONLY
> because Caddy is the sole path to `127.0.0.1:3000` — the Next server binds
> loopback and this firewall lock blocks 80/443 to non-Cloudflare sources.
> Never expose `:3000` directly (no extra published port, no second proxy
> bypassing Caddy), or a client could spoof its recorded IP.

---

## Step 6 — Bot Fight Mode, WAF rate-limit, caching, Under Attack

Cloudflare dashboard (free tier):

1. **Bot Fight Mode** — Security → Bots → enable **Bot Fight Mode**.
2. **Rate-limit rule on auth endpoints (AC3)** — Security → WAF →
   **Rate limiting rules → Create rule**:
   - Name: `auth-endpoints`
   - If incoming requests match: `URI Path` **starts with** `/api/auth/`
     **AND** `Request Method` **equals** `POST`. (Better Auth mounts at
     `/api/auth/*`; confirm via `app/api/auth/[...all]/route.ts`.)
   - **`Method = POST` is REQUIRED, not optional:** Better Auth's
     `[...all]` route also serves frequent GETs like `get-session` that a
     normal logged-in user hits on every navigation. Counting those toward
     the limit would rate-limit real users (worse on shared-NAT/mobile-carrier
     IPs). Scoping to POST counts only credential submissions (sign-in,
     sign-up, forget/reset-password).
   - Rate: **20 requests per 1 minute**, **per IP** (counting characteristic:
     IP).
   - Action: **Block** for 1 minute (or **Managed Challenge** if you prefer a
     softer first response).
   - Deploy.
   - **Drift note:** this rule exists only in the Cloudflare dashboard — there
     is no repo file representing it, so if it is deleted or a fresh CF zone is
     created, AC3 silently regresses. The exact definition above is the
     recreation reference. If the zone config grows, consider managing it as
     code via **Cloudflare Terraform** (out of scope here — over-engineering
     for a single rule).
3. **Cache static assets** — Caching → **Cache Rules → Create rule**:
   - Name: `next-static`
   - If `URI Path` **starts with** `/_next/static/` → **Cache eligibility:
     Eligible for cache**; **Edge TTL: Use cache-control header if present**.
     Next.js sets `Cache-Control: public, max-age=31536000, immutable` on
     hashed `/_next/static/*` assets, so Cloudflare will honour the long TTL
     automatically.
   - **Do NOT add cache rules for `/api/*` or HTML** — Cloudflare's defaults
     already bypass those; keep it that way.
4. **Under Attack mode (manual lever)** — confirm Security → Settings →
   Security Level can be set to **I'm Under Attack** on demand. Leave it OFF
   normally; it's the break-glass switch during an active flood.

---

## Step 7 — Verify the 4 acceptance criteria

**AC1 — origin IP not publicly resolvable:**

```bash
dig +short balikha.art      # Cloudflare IPs only; the box IP 104.64.213.188 must NOT appear
```

**AC2 — traffic flows through Cloudflare:**

```bash
curl -sI https://balikha.art | grep -i -E 'server: cloudflare|cf-ray'   # both present
curl -sI https://www.balikha.art   # must return 301 redirect to https://balikha.art
```

**AC3 — rate-limit on auth endpoints:** the acceptance evidence is an
**active probe**, not just "dashboard shows Active." From one IP, fire more
than 20 POSTs/min at a credential endpoint and confirm Cloudflare starts
returning `429` (or a challenge):

```bash
for i in $(seq 1 30); do \
  curl -s -o /dev/null -w "%{http_code}\n" -X POST https://balikha.art/api/auth/sign-in/email \
    -H 'content-type: application/json' \
    --data '{"email":"ratelimit-probe@example.com","password":"x"}'; \
done | sort | uniq -c
# Expect a mix of 4xx (rejected creds) THEN 429 once the per-minute limit trips.
```

Also confirm the `auth-endpoints` rule shows **Active** in the dashboard.
(The probe uses a non-existent account, so it never authenticates; it only
exercises the limiter.)

**AC4 — app logs correct client IPs:** make an authenticated request, then on
the box:

```bash
ssh deploy@104.64.213.188 'sudo journalctl -u balikha.service -n 50 --no-pager | grep -o "\"ip\":\"[^\"]*\"" | tail'
# Expect real client IPs (your own public IP when you test) — NOT a Cloudflare
# 104.x/172.64.x edge IP.
```

Also confirm `session.ip_address` for a fresh login is the real client IP:

```bash
ssh deploy@104.64.213.188 'sudo -u postgres psql -d balikha -c "select ip_address, created_at from session order by created_at desc limit 3;"'
```

---

## Step 8 — Rollback

**The correct fast rollback depends on which cutover stage you're in.** The key
fact: the Cloudflare Origin Cert is trusted ONLY by Cloudflare, so once Step 4
has installed the Origin-Cert Caddyfile, flipping DNS to grey-cloud does NOT
restore a working public site — direct browsers hit an untrusted cert.

**Before Step 4 (cert NOT yet swapped — only DNS proxied / SSL-strict set):**
grey-cloud DNS _is_ the fast, safe revert. The box still serves the publicly
valid Let's Encrypt cert, so direct traffic works immediately.

- Cloudflare DNS → set `balikha.art` + `www` back to **DNS-only (grey cloud)**.

**After Step 4 (Origin-Cert Caddyfile installed):** do NOT reach for grey-cloud
as the "fast" path — it breaks direct TLS. Instead:

- **Fast, stay-proxied:** revert at the edge — Cloudflare → **pause the site**
  (Overview → Advanced → Pause Cloudflare on Site) or revert the offending
  edge change (SSL mode, a WAF rule, Bot Fight Mode). Keeps DNS proxied so the
  Origin Cert stays valid CF↔origin.
- **Full revert to pre-4E (grey-cloud + LE):** required if you're abandoning
  4E entirely. Do all of:
  1. Revert the Caddyfile to the pre-4E (ACME) version from git history and
     re-run `90-app-runtime.sh` (so the box serves a publicly trusted LE cert
     again):
     ```bash
     git show <pre-4E-commit>:infra/production/Caddyfile   # recover the old file
     ```
  2. Unlock the firewall — re-open 80/443 to all (required for LE HTTP-01):
     ```bash
     sudo /root/balikha-infra/provision/30-firewall.sh
     ```
  3. Cloudflare DNS → grey-cloud both records.
  4. Cloudflare SSL mode can stay Full (strict) or revert; with grey-cloud it
     only affects direct traffic.
     Order matters: restore the LE cert + open the firewall **before** flipping to
     grey-cloud so HTTP-01 can renew.

**Lockout recovery (can't SSH):** use the **Linode LISH console** (Cloud
Manager → the Linode → Launch LISH Console), log in, and run
`sudo ufw allow 22/tcp` (SSH should never have been blocked, but this restores
it) and/or `sudo /root/balikha-infra/provision/30-firewall.sh` to reset rules.

---

## Step 9 — Maintenance: refreshing Cloudflare IP ranges

Cloudflare's IP ranges change rarely. When they do, update **both** in the same
change and redeploy/re-run:

1. Fetch the current lists: `https://www.cloudflare.com/ips-v4/` and
   `https://www.cloudflare.com/ips-v6/`.
2. Update `trusted_proxies` in `infra/production/Caddyfile` AND the
   `CF_IPV4`/`CF_IPV6` arrays in `infra/production/lock-origin-firewall.sh`.
3. Merge; on the box re-run `sudo /root/balikha-infra/provision/90-app-runtime.sh`
   (Caddy) and `sudo .../lock-origin-firewall.sh` (ufw), then `verify-edge.sh`.

---

## Step 10 — Roadmap note

On successful completion of all 4 ACs, mark **4E** done in
`docs/plans/balikha-roadmap.md` (git-ignored, local only):

- Change `### [ ] 4E` → `### [x] 4E`
- Set `**Status:**` to `done`
