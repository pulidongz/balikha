#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
require_root
log "Enabling systemd-timesyncd NTP."
timedatectl set-ntp true
systemctl enable --now systemd-timesyncd
timedatectl show-timesync --property=NTPSynchronized 2>/dev/null || true
timedatectl status | grep -Ei 'time zone|ntp' || true
