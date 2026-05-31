#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
require_root

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DROPIN=/etc/ssh/sshd_config.d/10-balikha-hardening.conf

log "Writing SSH hardening drop-in: $DROPIN"
cat > "$DROPIN" <<EOF
# Balikha host hardening (ticket #18 / 4A). Drop-in overrides stock config.
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
PermitEmptyPasswords no
AllowUsers ${DEPLOY_USER} root
X11Forwarding no
MaxAuthTries 3
LoginGraceTime 30
EOF
chmod 644 "$DROPIN"

# `sshd -t` validates; 99-verify uses `sshd -T` to dump effective config.
# `sshd -T` needs no -C here because there are no Match blocks -- if any are
# added later, the dump must pass -C user=...,host=...,addr=...
log "Validating sshd config."
sshd -t || die "sshd config invalid -- NOT reloading. Fix $DROPIN."

log "Reloading ssh (existing sessions stay alive)."
systemctl reload ssh 2>/dev/null || systemctl reload sshd

warn "Password auth is now OFF. Confirm a NEW key-based session still works"
warn "before closing this one. Recovery if locked out: Linode LISH console."
