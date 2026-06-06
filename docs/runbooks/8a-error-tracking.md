# 8A — Error tracking (Sentry) runbook

Ticket: https://github.com/pulidongz/balikha/issues/34 · Roadmap: 8A

Sentry is wired entirely through code + GitHub Actions config. There is
**nothing to install on the box** — no systemd unit, no `production.env`
change, no provision re-run. The DSN is build-inlined; source maps upload
during the CI production build.

## 1. One-time Sentry SaaS setup

1. Create a free account at https://sentry.io and a **Next.js** project
   (e.g. `balikha`). Note the **org slug** and **project slug**.
2. Copy the **DSN**: Project Settings → Client Keys (DSN). It is non-secret.
3. Create a source-map **auth token**: Settings → Auth Tokens → Create, with
   `project:releases` (and `org:read`) scope. Treat it as a secret.

## 2. GitHub repository configuration

In `pulidongz/balikha` → Settings → Secrets and variables → Actions:

- **Variables** (Variables tab):
  - `NEXT_PUBLIC_SENTRY_DSN` = the DSN from step 1.2
  - `SENTRY_ORG` = your org slug
  - `SENTRY_PROJECT` = your project slug
- **Secrets** (Secrets tab):
  - `SENTRY_AUTH_TOKEN` = the auth token from step 1.3

The next merge to `main` builds with these and uploads source maps. Until
they are set, the build still succeeds — Sentry simply stays disabled and
no maps upload (fail-open-disabled).

## 3. Alerting (AC2) — configure in the Sentry dashboard

Alerts → Create Alert → **Issues**:

- Rule A: _When_ a new issue is created → _Then_ send a notification to
  your email. (Satisfies "a newly introduced error triggers an alert".)
- Rule B: _When_ an issue changes state to **regressed** → notify email.

No code change — Sentry evaluates these server-side on ingested events.

## 4. Verify AC1 + AC3 on the deployed environment

AC1 ("unhandled production error appears with stack + request context") and
AC3 ("correlate to logs via x-request-id") are verified against prod because
Sentry is intentionally disabled in dev (`NODE_ENV !== 'production'`).

1. On a short-lived branch, add a temporary throwing Route Handler, e.g.
   `app/api/_sentry-verify/route.ts`:
   ```ts
   export function GET() {
     throw new Error('Sentry verification — ticket #34');
   }
   ```
2. Merge to `main`, let the deploy complete, then request
   `https://balikha.art/api/_sentry-verify`.
3. In Sentry, confirm a new issue `Error: Sentry verification — ticket #34`
   appears **with a readable stack trace** (source maps applied) and the
   request URL/method (AC1).
4. Open the event → Tags → copy the **`requestId`** value. On the box,
   `journalctl -u balikha.service | grep <requestId>` returns the matching
   Pino log line(s) for the same request (AC3).
5. Confirm Rule A fired an email (AC2).
6. **Remove the temporary route** in a follow-up commit.

## 5. Notes / limits

- Free tier: ~5k errors/month, 1 project — ample pre-launch. `tracesSampleRate`
  is 0 (no performance events consume quota).
- PII: `sendDefaultPii: false` + `lib/observability/scrub.ts` strip cookies,
  auth/captcha headers, and request bodies before send. Guarded by
  `npm run test:sentry` in addition to the team's standard checks.
- Client errors carry browser/route context but not the server `requestId`
  (it is a response header the browser cannot read for the document request).
  Server errors — where the Pino logs live — carry it. This is by design.
