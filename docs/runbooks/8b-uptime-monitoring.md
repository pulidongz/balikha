# 8B — Uptime monitoring (UptimeRobot) runbook

Ticket: https://github.com/pulidongz/balikha/issues/35 · Roadmap: 8B ·
Depends on: 4B (production environment)

Uptime monitoring for Balikha is **external configuration, not code**. The only
application piece — a health-check endpoint — already shipped with the
production deployment (ticket #19). There is **nothing to install on the box**,
no systemd unit, no `production.env` change, no deploy. The work is creating a
free UptimeRobot monitor against the public health URL and wiring an alert.

## 1. The health endpoint (already exists — AC1)

`app/api/health/route.ts` is a **shallow liveness probe**:

```
GET https://balikha.art/api/health  →  200  {"status":"ok"}
```

- It is `dynamic = 'force-dynamic'` and **intentionally does not touch the
  database**. It reports that the Next.js server process is up and serving —
  which is exactly what an uptime monitor should test. A DB-dependent check
  would turn a transient DB blip into a false "site down" page and add load on
  every probe.
- It is already consumed by the deploy health gate (`infra/production/deploy.sh`
  curls both the loopback `http://127.0.0.1:3000/api/health` and the public
  `https://balikha.art/api/health`) and by `infra/production/verify-edge.sh`.
- **Do not** make this endpoint deeper for monitoring. If a DB-aware readiness
  signal is ever wanted, add a *separate* route rather than changing this one.

No code change is required for this ticket.

## 2. One-time UptimeRobot setup (AC2)

UptimeRobot free tier covers this: up to 50 monitors at a 5-minute interval with
email alerting — ample for one production URL.

1. Create a free account at https://uptimerobot.com.
2. **Add New Monitor**:
   - **Monitor Type:** `Keyword` (preferred over plain HTTP(s) — it asserts the
     body, not just a 2xx, so a 200 that serves the wrong content still alerts).
   - **Friendly Name:** `Balikha production`
   - **URL (or IP):** `https://balikha.art/api/health`
   - **Keyword Value:** `ok` (matches the `{"status":"ok"}` body)
   - **Alert condition:** **down when the keyword is NOT found** — newer UI:
     "Alert when keyword is not found"; classic UI dropdown: `not exists`. The
     success word `ok` is always present when healthy, so its *absence* means
     down. (Do **not** pick "exists"/"alert when keyword is found" — that is
     backwards and would alarm while the site is healthy.)
   - **Monitoring Interval:** `5 minutes` (free-tier minimum)
   - **Monitor Timeout:** default (30s) is fine.
3. Save. Within a few minutes the monitor should read **Up** (green).

> Why monitor the **public** URL, not the origin: the origin IP is firewalled to
> Cloudflare ranges only (ticket 4E),
> so an external monitor *cannot* reach the box directly (see
> `infra/production/lock-origin-firewall.sh`) — and monitoring `balikha.art` is
> what you actually want: it tests the full DNS → Cloudflare →
> origin → app path that real users traverse.

## 3. Cloudflare edge interaction (contingency)

The site sits behind Cloudflare edge protection + Bot Fight Mode (ticket 4E).
A plain `GET` to `/api/health` is **already reachable through Cloudflare today**
— `deploy.sh` curls `https://balikha.art/api/health` on every deploy and treats
the response as the public health gate — so UptimeRobot (which sends a similar
simple GET) will almost certainly pass without any change.

**Only if** the monitor reports down with a `403`/challenge page (verify first
with `curl -fsS https://balikha.art/api/health` from your laptop — if curl gets
`{"status":"ok"}`, the path is not challenged):

- In the Cloudflare dashboard → **Security → WAF → Custom rules**, add a rule:
  - _When_ `URI Path equals /api/health`
  - _Then_ action **Skip** → skip remaining custom rules / managed checks.
- Free plan allows up to 5 custom rules. This carves out only the health path;
  the rest of the site keeps full edge protection.

## 4. Alerting (AC3)

In UptimeRobot → **My Settings → Alert Contacts**:

1. Add an **email** alert contact (your ops address) and verify it.
2. Attach that contact to the `Balikha production` monitor (edit monitor →
   Alert Contacts To Notify → select it).
3. Leave "notify when **down** and when **back up**" enabled. With a 5-minute
   interval, an outage triggers an email within ~5 minutes (AC3: "within
   minutes").

Optional: add a second contact (e.g. SMS/Telegram/Slack) for redundancy, and
publish a free **Status Page** (UptimeRobot → Status Pages) at a
`stats.uptimerobot.com/...` URL for at-a-glance status.

## 5. Verify

- **AC1** — `curl -fsS https://balikha.art/api/health` returns `{"status":"ok"}`
  with HTTP 200.
- **AC2** — the UptimeRobot monitor shows **Up** and a populated check history
  (one entry per 5 minutes).
- **AC3** — trigger a controlled test: in UptimeRobot, **Pause** is not a real
  test; instead point a throwaway second monitor at a deliberately wrong path
  (e.g. `https://balikha.art/api/health-nope`, keyword `ok`) and confirm it goes
  **Down** and emails you within minutes, then delete it. (Do not take the real
  site down to test alerting.)

## 6. On alert — what to do

A "Balikha production is DOWN" email means the public health path failed. Triage:

1. `curl -v https://balikha.art/api/health` — is it DNS, TLS, Cloudflare (5xx
   from the edge), or the origin app?
2. SSH to the box and check the app + loopback health gate:
   `curl -fsS http://127.0.0.1:3000/api/health` (see
   `docs/runbooks/4b-production-deployment.md`).
3. If the box is up but the edge is failing, check Cloudflare status / the 4E
   runbook (`docs/runbooks/4e-cloudflare-edge.md`).
4. If the app process is down, the systemd unit + deploy/rollback steps are in
   the 4B and 4D runbooks.

## Notes

- **Free-tier limits:** 5-minute interval, 50 monitors, email alerts — sufficient
  for launch. Tighten the interval / add channels later if traction warrants.
- **Out of scope (per ticket):** error tracking (8A, shipped) and synthetic /
  multi-step transaction monitoring. This is liveness only.
