#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
require_root
require_ubuntu_2404
# Fail fast: validate ALL required inputs before ANY mutation, so a forgotten
# var can't leave a half-provisioned box after the SSH-lockout gate (Issue 11).
: "${DEPLOY_PUBKEY:?Set DEPLOY_PUBKEY to the deploy PUBLIC SSH key before running provision.sh}"
: "${DB_PASSWORD:?Set DB_PASSWORD to the production DB role password before running provision.sh}"
command -v curl >/dev/null || die "curl missing - install before continuing."
log "Ubuntu 24.04 confirmed on $(hostname). Required inputs present."
log "Public IP: $(curl -fsS --max-time 5 https://api.ipify.org || echo unknown)"
log "Preflight OK."
