#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
require_root

log "Enabling unattended-upgrades (security updates + auto reboot 03:30 UTC)."
cat > /etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
cat > /etc/apt/apt.conf.d/52balikha-unattended <<'EOF'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
EOF
# Enable only -- the unattended-upgrades unit is oneshot/shutdown-triggered, so
# `restart` can exit nonzero and abort the run under set -e (Issue 3 r2). The
# apt-daily{,-upgrade}.timer units drive scheduling; 99-verify checks the timer.
systemctl enable unattended-upgrades
