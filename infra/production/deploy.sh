#!/usr/bin/env bash
set -euo pipefail
# Usage: ./deploy.sh <deploy-user@host> <path-to-balikha-deploy-*.tar.gz>
#
# Brief-downtime deploy (Issue 7), NOT zero-downtime: the symlink flips,
# migrations run, then the app restarts — between migrate and restart the
# old process briefly sees the new schema. Fine for additive migrations and
# at launch (no traffic); destructive migrations need expand/contract later.
#
# Requires the deploy user's NOPASSWD sudo from 4A (Issue 5): every `sudo`
# below assumes no password prompt. If NOPASSWD ever regresses, these hang
# silently over the non-TTY ssh — re-confirm 4A's sudoers drop-in first.
HOST="${1:?ssh target required, e.g. deploy@1.2.3.4}"
ARTIFACT="${2:?path to balikha-deploy-*.tar.gz required}"
test -f "$ARTIFACT" || { echo "FATAL: artifact not found: $ARTIFACT"; exit 1; }
APP_DIR=/opt/balikha
APP_HOME=/var/lib/balikha          # balikha-app's HOME (npm cache) — Issue 4
RELEASES_TO_KEEP=5                  # Issue 9: prune old releases
TS="$(date +%Y%m%d%H%M%S)"
RELEASE="$APP_DIR/releases/$TS"
# Guard against an empty TS/RELEASE feeding `mkdir -p ""` / `rm -rf` below.
test -n "$TS" && [ "$RELEASE" = "$APP_DIR/releases/$TS" ] \
  || { echo "FATAL: bad RELEASE path"; exit 1; }

echo "→ shipping artifact to $HOST"
scp "$ARTIFACT" "$HOST:/tmp/balikha-deploy.tar.gz"

echo "→ installing release $TS on $HOST"
# Heredoc is INTENTIONALLY unquoted: $RELEASE/$APP_DIR/$APP_HOME/$TS/
# $RELEASES_TO_KEEP expand on THIS workstation (TS is computed locally) and
# are baked into the remote script before it runs. Nothing inside needs
# remote-side expansion. `ssh -T` (no TTY) + `bash -se` (-e exit on error).
ssh -T "$HOST" bash -se <<REMOTE
set -euo pipefail
sudo mkdir -p "$RELEASE"
sudo tar -xzf /tmp/balikha-deploy.tar.gz -C "$RELEASE"
sudo chown -R balikha-app:balikha-app "$RELEASE"
# drizzle.config.ts loads .env.development if present and would override the
# real DATABASE_URL — it must NOT exist on the box.
if [ -e "$RELEASE/.env.development" ]; then
  echo "FATAL: .env.development present in release — aborting"; exit 1
fi
# npm ci is I/O-bound (safe on 1 GB, unlike next build). HOME is set so npm's
# cache lands in the app user's home (Issue 4). Installs prod + dev deps —
# do NOT add --omit=dev: drizzle-kit (migrate) and tsx (tick) are devDeps.
sudo -u balikha-app env HOME="$APP_HOME" bash -lc "cd '$RELEASE' && npm ci"
# Assert the devDep tools the migrate + tick units depend on are present
# (Issue 12) — guards against a future --omit=dev silently breaking both.
test -x "$RELEASE/node_modules/.bin/tsx" \
  || { echo "FATAL: tsx missing — did npm ci run with --omit=dev?"; exit 1; }
test -x "$RELEASE/node_modules/.bin/drizzle-kit" \
  || { echo "FATAL: drizzle-kit missing"; exit 1; }
# Pre-migration backup (4D): snapshot the DB BEFORE flipping the symlink +
# migrating, so an unattended push-to-deploy migration always has a fresh
# restore point. Placed before the symlink flip so a backup failure leaves
# 'current' on the old, good release (no half-deploy). Runs backup.sh in
# 'predeploy' mode → a SEPARATE predeploy/ R2 prefix, so deploy-time snapshots
# never evict the nightly daily/ retention pool (review HIGH/MEDIUM).
# Guard (Issue 1): if 4D box setup (90-app-runtime.sh + backup.env) wasn't
# completed before the push-to-main trigger was armed, fail loudly HERE —
# before any state change — rather than stranding a half-applied deploy.
systemctl cat balikha-backup.service >/dev/null 2>&1 \
  || { echo "FATAL: balikha-backup.service not installed — complete 4D box setup (runbook §1-3) before deploying"; exit 1; }
sudo test -f /etc/balikha/backup.env \
  || { echo "FATAL: /etc/balikha/backup.env missing — complete 4D box setup before deploying"; exit 1; }
sudo bash -c "set -a; . /etc/balikha/backup.env; set +a; '$RELEASE'/infra/production/backup.sh predeploy" \
  || { echo "FATAL: pre-migration backup failed — aborting before symlink flip"; exit 1; }
# Flip the symlink BEFORE migrate/restart so the oneshot units (which use
# WorkingDirectory=/opt/balikha/current) run this release.
sudo ln -sfn "$RELEASE" "$APP_DIR/current"
# Type=oneshot: 'systemctl start' blocks until done and returns exit status.
sudo systemctl start balikha-migrate.service
sudo systemctl restart balikha.service
sudo systemctl enable --now balikha-orders-tick.timer
# HARD health gate on the app PROCESS over loopback (Issue 13) — independent
# of DNS/TLS so a fresh-box ACME delay can't false-fail the deploy.
# --retry-connrefused is REQUIRED: plain --retry does NOT retry connection-
# refused, so without it the gate aborts on the ~0.5s window before next start
# is listening, even though the app comes up fine moments later.
curl -fsS --retry 10 --retry-delay 2 --retry-connrefused http://127.0.0.1:3000/api/health \
  || { echo "FATAL: app not healthy on 127.0.0.1:3000"; exit 1; }
# Prune old releases, keeping the newest \$RELEASES_TO_KEEP (Issue 9).
ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n +\$(( $RELEASES_TO_KEEP + 1 )) \
  | xargs -r sudo rm -rf
REMOTE

echo "→ public URL check (soft — Let's Encrypt issuance may lag on a first deploy)"
if curl -fsS --retry 8 --retry-delay 5 --retry-connrefused https://balikha.art/api/health; then
  echo; echo "✓ public endpoint healthy"
else
  echo "⚠️  public URL not healthy yet — app is up on the box (loopback gate"
  echo "    passed). On a first deploy this is usually Caddy still completing"
  echo "    ACME. Check: ssh $HOST 'sudo journalctl -u caddy -n 50'"
fi
echo "✓ deploy complete: release $TS"
echo "  rollback: ssh $HOST 'sudo ln -sfn <previous-release> $APP_DIR/current && sudo systemctl restart balikha.service'"
echo "  (rollback is code-only — see runbook: do NOT use it to undo a release that ran a schema migration)"
