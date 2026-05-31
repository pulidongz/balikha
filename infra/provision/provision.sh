#!/usr/bin/env bash
# Orchestrates the full provisioning run with the SSH-lockout safety gate.
# Usage: sudo ./provision.sh
source "$(dirname "$0")/lib/common.sh"
require_root
HERE="$(cd "$(dirname "$0")" && pwd)"

run() { log "── running $1"; bash "$HERE/$1"; }

run 00-preflight.sh
run 10-base.sh

warn "Before disabling SSH password auth, you MUST confirm key-based login"
warn "works in a SEPARATE terminal:  ssh deploy@<this-host>"
confirm "Have you confirmed key-based SSH login as 'deploy' in another session?" \
  || die "Aborting before SSH hardening. Verify key login, then re-run."

for step in 20-ssh 30-firewall 40-fail2ban 50-autoupdates 60-swap 70-timesync 80-postgres; do
  run "$step.sh"
done

log "Provisioning complete. Now run:  sudo ./99-verify.sh"
