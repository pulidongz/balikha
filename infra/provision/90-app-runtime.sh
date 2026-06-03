#!/usr/bin/env bash
# 90-app-runtime.sh — provision the Balikha app runtime (Node 22, Caddy,
# balikha-app user, deploy tree, systemd units, prod Caddyfile).
# Part of ticket #19 / 4B.  Run after 80-postgres.sh.
#
# Idempotent: every mutation is guarded so re-running on a provisioned box
# converges cleanly without errors or duplicates.
source "$(dirname "$0")/lib/common.sh"
require_root

# ---------------------------------------------------------------------------
# 1. Create the balikha-app system user (with a real home dir — Issue 4)
# ---------------------------------------------------------------------------
log "Ensuring system user 'balikha-app' exists."
# npm/tsx/drizzle-kit write cache to $HOME/.npm; a --no-create-home user would
# have no writable HOME and npm ci would fail or scatter files to unexpected
# locations.  The user still has no SSH/login capability (nologin shell).
if ! id balikha-app >/dev/null 2>&1; then
  useradd --system \
          --create-home \
          --home-dir /var/lib/balikha \
          --shell /usr/sbin/nologin \
          balikha-app
  log "User 'balikha-app' created with home /var/lib/balikha."
else
  log "User 'balikha-app' already exists — skipping useradd."
fi

# Ensure the home dir exists with correct ownership, even if useradd was skipped.
install -d -o balikha-app -g balikha-app -m 755 /var/lib/balikha

# ---------------------------------------------------------------------------
# 2. Install Node.js 22.x via NodeSource (if absent or < v22.14.0)
# ---------------------------------------------------------------------------
NODE_MIN_MAJOR=22
NODE_MIN_MINOR=14
NODE_MIN_PATCH=0
NODE_MIN_VERSION="${NODE_MIN_MAJOR}.${NODE_MIN_MINOR}.${NODE_MIN_PATCH}"

need_node=true
if command -v node >/dev/null 2>&1; then
  # node -v prints "v22.14.0"; strip the leading 'v'
  INSTALLED_VERSION="$(node -v | sed 's/^v//')"
  # Split on '.' for comparison.
  IV_MAJOR="$(printf '%s' "$INSTALLED_VERSION" | cut -d. -f1)"
  IV_MINOR="$(printf '%s' "$INSTALLED_VERSION" | cut -d. -f2)"
  IV_PATCH="$(printf '%s' "$INSTALLED_VERSION" | cut -d. -f3)"
  if [ "${IV_MAJOR:-0}" -gt "$NODE_MIN_MAJOR" ] || \
     { [ "${IV_MAJOR:-0}" -eq "$NODE_MIN_MAJOR" ] && \
       [ "${IV_MINOR:-0}" -gt "$NODE_MIN_MINOR" ]; } || \
     { [ "${IV_MAJOR:-0}" -eq "$NODE_MIN_MAJOR" ] && \
       [ "${IV_MINOR:-0}" -eq "$NODE_MIN_MINOR" ] && \
       [ "${IV_PATCH:-0}" -ge "$NODE_MIN_PATCH" ]; }; then
    log "Node.js ${INSTALLED_VERSION} is already >= ${NODE_MIN_VERSION} — skipping NodeSource install."
    need_node=false
  else
    log "Node.js ${INSTALLED_VERSION} is older than ${NODE_MIN_VERSION} — reinstalling via NodeSource."
  fi
fi

if [ "$need_node" = "true" ]; then
  log "Installing Node.js 22.x from NodeSource."
  # NodeSource setup script idempotently configures the apt repo + signing key.
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Assert the installed version meets the minimum (die loudly on mismatch so
# npm ci does not silently fail — package.json engines is >=22.14.0 and
# engine-strict is enabled in .npmrc).
INSTALLED_VERSION="$(node -v | sed 's/^v//')"
IV_MAJOR="$(printf '%s' "$INSTALLED_VERSION" | cut -d. -f1)"
IV_MINOR="$(printf '%s' "$INSTALLED_VERSION" | cut -d. -f2)"
IV_PATCH="$(printf '%s' "$INSTALLED_VERSION" | cut -d. -f3)"
if ! { [ "${IV_MAJOR:-0}" -gt "$NODE_MIN_MAJOR" ] || \
       { [ "${IV_MAJOR:-0}" -eq "$NODE_MIN_MAJOR" ] && \
         [ "${IV_MINOR:-0}" -gt "$NODE_MIN_MINOR" ]; } || \
       { [ "${IV_MAJOR:-0}" -eq "$NODE_MIN_MAJOR" ] && \
         [ "${IV_MINOR:-0}" -eq "$NODE_MIN_MINOR" ] && \
         [ "${IV_PATCH:-0}" -ge "$NODE_MIN_PATCH" ]; }; }; then
  die "Node.js ${INSTALLED_VERSION} is still < ${NODE_MIN_VERSION} after installation — check NodeSource setup."
fi
log "Node.js ${INSTALLED_VERSION} satisfies >= ${NODE_MIN_VERSION}."

# ---------------------------------------------------------------------------
# 3. Install Caddy from the official Cloudsmith apt repo
# ---------------------------------------------------------------------------
if ! command -v caddy >/dev/null 2>&1; then
  log "Installing Caddy from the official Cloudsmith repo."
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
else
  log "Caddy already installed — skipping."
fi

# ---------------------------------------------------------------------------
# 4. Create the deploy tree
# ---------------------------------------------------------------------------
log "Ensuring /opt/balikha/releases (owned balikha-app:balikha-app)."
install -d -o balikha-app -g balikha-app -m 755 /opt/balikha/releases

# ---------------------------------------------------------------------------
# 4a. Install backup tooling: postgresql-client-16 + awscli (4D)
# ---------------------------------------------------------------------------
# pg_dump is only transitively present; awscli is not installed by any earlier
# script. Both are required by backup.sh (run as root by balikha-backup.service).
if ! command -v pg_dump >/dev/null 2>&1; then
  log "Installing postgresql-client-16 (provides pg_dump/pg_restore)."
  apt-get install -y postgresql-client-16
else
  log "pg_dump already present — skipping postgresql-client-16 install."
fi

if ! command -v aws >/dev/null 2>&1; then
  log "Installing awscli."
  apt-get install -y awscli
else
  log "aws already present — skipping awscli install."
fi

# ---------------------------------------------------------------------------
# 5. Install systemd units
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# The script lives in infra/provision/; the units are in infra/production/systemd/.
# When deployed via scp -r infra/provision root@<ip>:/root/provision, this
# path won't exist.  Check both the relative path (local dev/testing) and an
# explicit search.
UNITS_SRC=""
# Try relative to infra/provision/../production/systemd
CANDIDATE="$(cd "$(dirname "$0")/.." && pwd)/production/systemd"
if [ -d "$CANDIDATE" ]; then
  UNITS_SRC="$CANDIDATE"
fi

if [ -n "$UNITS_SRC" ]; then
  log "Installing systemd units from ${UNITS_SRC}."
  cp "${UNITS_SRC}/"*.service "${UNITS_SRC}/"*.timer /etc/systemd/system/
  systemctl daemon-reload
  systemctl enable balikha.service balikha-orders-tick.timer balikha-backup.timer
  log "Units installed and enabled (not started — no release on disk yet)."
else
  die "infra/production/systemd/ not found at ${CANDIDATE} — ship the full infra/ tree (both provision/ and production/ as siblings). See the runbook Step 1."
fi

# ---------------------------------------------------------------------------
# 6. Install the prod Caddyfile
# ---------------------------------------------------------------------------
CADDYFILE_SRC=""
CADDY_CANDIDATE="$(cd "$(dirname "$0")/.." && pwd)/production/Caddyfile"
if [ -f "$CADDY_CANDIDATE" ]; then
  CADDYFILE_SRC="$CADDY_CANDIDATE"
fi

if [ -n "$CADDYFILE_SRC" ]; then
  log "Installing prod Caddyfile from ${CADDYFILE_SRC}."
  cp "$CADDYFILE_SRC" /etc/caddy/Caddyfile
  if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
    log "Caddyfile validated."
  else
    die "Caddyfile validation failed — check /etc/caddy/Caddyfile."
  fi
  if systemctl is-active --quiet caddy; then
    systemctl reload caddy
    log "Caddy reloaded with new Caddyfile."
  else
    systemctl enable --now caddy
    log "Caddy enabled and started."
  fi
  warn "TLS (Let's Encrypt) issuance requires:"
  warn "  1. The apex balikha.art A record points to this box's public IP."
  warn "  2. Ports 80 and 443 are open (4A's 30-firewall.sh opens them)."
  warn "  3. The record is grey-cloud (DNS-only) — not proxied through Cloudflare."
else
  die "infra/production/Caddyfile not found at ${CADDY_CANDIDATE} — ship the full infra/ tree (both provision/ and production/ as siblings). See the runbook Step 1."
fi

# ---------------------------------------------------------------------------
# 7. Confirm /etc/balikha exists (created by 4A's 10-base.sh)
# ---------------------------------------------------------------------------
if [ -d /etc/balikha ]; then
  log "/etc/balikha exists — ready for production.env (written by operator in 4B)."
else
  die "/etc/balikha does not exist — has 4A (10-base.sh) been run?"
fi

warn "ACTION REQUIRED (4D): write /etc/balikha/backup.env before the first backup runs."
warn "  Copy .env.backup.example, fill in the R2 token, then: chmod 600 /etc/balikha/backup.env && chown root:root /etc/balikha/backup.env"
log "90-app-runtime.sh complete."
