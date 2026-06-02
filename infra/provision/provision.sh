#!/usr/bin/env bash
# Orchestrates the full provisioning run with the SSH-lockout safety gate.
# Usage: sudo ./provision.sh
source "$(dirname "$0")/lib/common.sh"
require_root
HERE="$(cd "$(dirname "$0")" && pwd)"

run() { log "── running $1"; bash "$HERE/$1"; }

# Single source of truth: discover numbered steps from disk. Exclusions:
#   99-verify  — run separately after provisioning.
#   90-app-runtime — a 4B step (app runtime: Node/Caddy/systemd units) that
#     reaches into ../production/ and is run standalone from the full infra/
#     tree per the 4B runbook; it is NOT part of the 4A orchestrated suite.
mapfile -t STEPS < <(cd "$HERE" && ls [0-9][0-9]-*.sh 2>/dev/null | grep -vE '^(90|99)-' | sort)
for step in "${STEPS[@]}"; do
  if [ "$step" = "20-ssh.sh" ]; then
    warn "Before disabling SSH password auth, confirm key login works in a SEPARATE terminal: ssh ${DEPLOY_USER}@<this-host>"
    confirm "Have you confirmed key-based SSH login as '${DEPLOY_USER}' in another session?" \
      || die "Aborting before SSH hardening. Verify key login, then re-run."
  fi
  run "$step"
done
log "Provisioning complete. Now run:  sudo ./99-verify.sh"
