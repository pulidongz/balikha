#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
require_root
log "Enabling systemd-timesyncd NTP."
timedatectl set-ntp true
systemctl enable --now systemd-timesyncd
