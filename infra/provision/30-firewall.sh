#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
require_root

log "Configuring ufw: default deny inbound, allow outbound."
ufw default deny incoming
ufw default allow outgoing

# Allow SSH FIRST so enabling ufw can't drop our own session.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp

log "Enabling ufw (idempotent; --force avoids the interactive prompt)."
ufw --force enable
ufw status verbose
# Note: 5432 is intentionally NOT opened -- Postgres stays localhost-only.
