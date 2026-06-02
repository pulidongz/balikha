#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
require_root
SWAPFILE=/swapfile

if swapon --show | grep -q "$SWAPFILE"; then
  log "Swap already active at $SWAPFILE -- skipping creation."
else
  log "Creating a 2 GB swapfile at $SWAPFILE."
  # On the dd fallback, remove any partial file fallocate may have left.
  fallocate -l 2G "$SWAPFILE" || { rm -f "$SWAPFILE"; dd if=/dev/zero of="$SWAPFILE" bs=1M count=2048; }
  chmod 600 "$SWAPFILE"
  mkswap "$SWAPFILE"
  swapon "$SWAPFILE"
fi
ensure_line "$SWAPFILE none swap sw 0 0" /etc/fstab

log "Tuning swappiness for a RAM-first, swap-as-insurance profile."
cat > /etc/sysctl.d/99-balikha-swap.conf <<'EOF'
vm.swappiness = 10
vm.vfs_cache_pressure = 50
EOF
sysctl --system >/dev/null
swapon --show
