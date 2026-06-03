#!/usr/bin/env bash
# Verify the 4E Cloudflare edge cutover FROM THE BOX. Run as root after
# lock-origin-firewall.sh. Mirrors the check() pattern from 99-verify.sh.
source "$(dirname "$0")/../provision/lib/common.sh"
require_root
fail=0

# SCOPE: this validates ORIGIN-side state only — cert files, Caddy config,
# firewall lock, and loopback app health. Public-edge acceptance evidence
# (AC1: dig shows CF IPs only; AC2: cf-ray header; AC4: real client IP in
# app logs) comes from the 4E runbook Step 7, not this script. "ALL EDGE
# CHECKS PASSED" means the origin is correctly configured, not that the
# public site is serving end-to-end.
log "verify-edge.sh: validating ORIGIN-side state (cert, Caddy, firewall, loopback). Public-edge AC1/AC2/AC4 evidence is in runbook Step 7."

check() { # check "label" "command" "expected-extended-regex"
  local label="$1" out rc
  out="$(eval "$2" 2>/dev/null)" && rc=0 || rc=$?
  if [ "$rc" -eq 0 ] && grep -qiE "$3" <<<"$out"; then
    log "PASS: $label"
  else
    warn "FAIL: $label  (rc=$rc; got: ${out:-<empty>})"; fail=1
  fi
}

check "origin cert present"        "ls -l /etc/caddy/cloudflare-origin.pem"     "cloudflare-origin\.pem"
check "origin key present"         "ls -l /etc/caddy/cloudflare-origin-key.pem" "cloudflare-origin-key\.pem"
check "caddy user can read origin key" "sudo -u caddy test -r /etc/caddy/cloudflare-origin-key.pem && echo readable" "readable"
check "origin cert covers wildcard/www SAN" "openssl x509 -in /etc/caddy/cloudflare-origin.pem -noout -text" "DNS:\*\.balikha\.art|DNS:www\.balikha\.art"
check "Caddyfile uses origin cert" "cat /etc/caddy/Caddyfile"                   "tls /etc/caddy/cloudflare-origin\.pem"
check "Caddy trusts CF proxies"    "cat /etc/caddy/Caddyfile"                   "client_ip_headers|trusted_proxies"
check "Caddy config valid"         "caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile" "Valid configuration"
# Check uses the stable ufw comment tag set by lock-origin-firewall.sh rather
# than hardcoded CF IP octets, so it stays correct as IP ranges are refreshed.
check "80/443 allowed from CF"     "ufw status"                                 "cloudflare-edge"
check "SSH still allowed"          "ufw status"                                 "(22/tcp|OpenSSH).*ALLOW"
check "app healthy on loopback"    "curl -fsS http://127.0.0.1:3000/api/health" "ok"

# Negative asserts below rely on the preceding positive check()s having already
# proven ufw/Caddyfile presence — an errored command cannot false-PASS here
# because a missing tool would have failed the earlier PASS check first.

# Negative assert: 80/443 must NOT be open to Anywhere after the lock.
if ufw status | grep -qE '(^|[[:space:]])(80|443)(,[0-9]+)?/tcp[[:space:]]+ALLOW[[:space:]]+Anywhere'; then
  warn "FAIL: 80/443 still open to Anywhere"; fail=1
else
  log "PASS: no broad Anywhere allow on 80/443"
fi

# ACME must be gone (4E removes the Let's Encrypt time-bomb). Reject the global
# `email` directive AND per-site ACME signals (acme_ca / acme_dns / `tls user@host`),
# ignoring comment lines. The origin must use explicit `tls <cert> <key>` files only.
if grep -vE '^[[:space:]]*#' /etc/caddy/Caddyfile | grep -qE '^[[:space:]]*(email|acme_ca|acme_dns)[[:space:]]|^[[:space:]]*tls[[:space:]]+[^[:space:]]*@'; then
  warn "FAIL: Caddyfile has an ACME signal (email/acme_ca/acme_dns/tls <email>) — origin must use explicit tls cert files, no ACME"; fail=1
else
  log "PASS: no ACME directives in Caddyfile (explicit tls cert only)"
fi

[ "$fail" -eq 0 ] && log "ALL EDGE CHECKS PASSED (origin-side; see runbook Step 7 for public-edge ACs)." || die "Some edge checks FAILED (see above)."
