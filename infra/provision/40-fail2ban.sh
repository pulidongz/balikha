#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
require_root

log "Writing fail2ban jail.local (sshd jail)."
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true
EOF

systemctl enable fail2ban
systemctl restart fail2ban
fail2ban-client status sshd || warn "fail2ban sshd jail not reporting yet."
