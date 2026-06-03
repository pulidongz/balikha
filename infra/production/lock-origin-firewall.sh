#!/usr/bin/env bash
# Lock the origin firewall so ports 80/443 only accept Cloudflare's edge IPs.
#
# Run this ONLY as part of the 4E cutover, AFTER balikha.art is proxied through
# Cloudflare and Caddy is serving the Cloudflare Origin Certificate. Running it
# earlier blocks all legitimate traffic (and any Let's Encrypt HTTP-01, which
# must no longer be in use once this runs).
#
# SSH (OpenSSH / port 22) is never touched. Postgres (5432) stays localhost-only.
#
# Idempotent: removes broad 80/443 allow rules, then (re)adds per-CIDR rules
# (ufw skips duplicates). Re-run after refreshing the CIDR lists below from
#   https://www.cloudflare.com/ips-v4/   https://www.cloudflare.com/ips-v6/
# KEEP THESE IN SYNC with the trusted_proxies list in
# infra/production/Caddyfile.
set -euo pipefail
source "$(dirname "$0")/../provision/lib/common.sh"
require_root

CF_IPV4=(
  173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22
  141.101.64.0/18 108.162.192.0/18 190.93.240.0/20 188.114.96.0/20
  197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13
  104.24.0.0/14 172.64.0.0/13 131.0.72.0/22
)
CF_IPV6=(
  2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32
  2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32
)

log "Removing any broad (Anywhere) allow rules for 80/443 (no-op if absent)."
# 'ufw delete' returns non-zero when the rule is already absent; that is the
# desired end-state ("ensure absent"), not a meaningful failure.
ufw delete allow 80/tcp  || true
ufw delete allow 443/tcp || true

log "Allowing 80,443 from Cloudflare IPv4 ranges."
for cidr in "${CF_IPV4[@]}"; do
  ufw allow from "$cidr" to any port 80,443 proto tcp comment 'cloudflare-edge'
done
log "Allowing 80,443 from Cloudflare IPv6 ranges."
for cidr in "${CF_IPV6[@]}"; do
  ufw allow from "$cidr" to any port 80,443 proto tcp comment 'cloudflare-edge'
done

log "Reloading ufw."
ufw reload
ufw status verbose
log "Origin firewall locked to Cloudflare. SSH (22) and Postgres (localhost) unchanged."
