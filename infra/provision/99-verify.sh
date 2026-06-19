#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
require_root
fail=0
# check: command MUST exit 0 AND its stdout must match the regex. stderr is
# NOT folded in, so an errored command can't false-PASS by printing matching
# text to stderr.
check() { # check "label" "command" "expected-extended-regex"
  local label="$1" out rc
  out="$(eval "$2" 2>/dev/null)" && rc=0 || rc=$?
  if [ "$rc" -eq 0 ] && grep -qiE "$3" <<<"$out"; then
    log "PASS: $label"
  else
    warn "FAIL: $label  (rc=$rc; got: ${out:-<empty>})"; fail=1
  fi
}

# No inner | grep in command strings: rc must reflect the real command, not
# grep's exit, so the success/match separation doesn't depend on pipefail.
check "AC1 password auth off"   "sshd -T"                                     "^passwordauthentication no"
check "AC1 pubkey auth on"      "sshd -T"                                     "^pubkeyauthentication yes"
check "AC2 ufw active"          "ufw status verbose"                          "Status: active"
check "AC2 ufw default deny in" "ufw status verbose"                          "deny \(incoming\)"
# The most dangerous rule to be missing -- assert SSH is allowed.
check "AC2 SSH allowed"         "ufw status"                                  "(OpenSSH|(^|[^0-9])22/tcp).*ALLOW"
# Each check matches only its OWN port: the open form (80/tcp or 443/tcp) OR
# the combined comma form (80,443/tcp or 443,80/tcp) produced by
# infra/production/lock-origin-firewall.sh, so this verifier passes pre- and
# post-4E. The CF-lock itself is asserted by infra/production/verify-edge.sh.
check "AC2 80 allowed"          "ufw status"                                  "(^|[^0-9])(80/tcp|80,443/tcp|443,80/tcp).*ALLOW"
check "AC2 443 allowed"         "ufw status"                                  "(^|[^0-9])(443/tcp|80,443/tcp|443,80/tcp).*ALLOW"
# 5432 must NOT be open -- explicit negative assert (avoids grep -c gymnastics).
if ufw status | grep -qE '(^|[^0-9])5432'; then warn "FAIL: AC2 5432 must NOT be open"; fail=1; else log "PASS: AC2 5432 not open"; fi
check "AC3 pg listen_addresses" "sudo -u postgres psql -tAc 'SHOW listen_addresses;'" "localhost"
# Postgres must bind loopback only -- any 5432 socket line must be 127.0.0.1/::1.
if ! ss -ltn | grep -qE ':5432'; then
  log "PASS: AC3 pg has no public listening socket"
elif ss -ltn | grep -E ':5432' | grep -qvE '127\.0\.0\.1|\[::1\]'; then
  warn "FAIL: AC3 pg listening on a non-loopback address"; fail=1
else
  log "PASS: AC3 pg bound to loopback only"
fi
check "AC4 swap active"         "swapon --show"                               "/swapfile"
check "AC5 deploy in sudo grp"  "id \"$DEPLOY_USER\""                         "(^| )sudo( |$|,)|\(sudo\)"
# Prove sudo is actually USABLE -- NOPASSWD only. A password-required grant on a
# --disabled-password user is an unusable state, so do NOT accept
# a bare "(ALL) ALL" alternative (it would false-PASS that broken state).
check "AC5 deploy sudo usable"  "sudo -n -l -U \"$DEPLOY_USER\""               "NOPASSWD"
check "fail2ban sshd jail"      "fail2ban-client status sshd"                 "Status"
# Auto-update SCHEDULING is deterministic via the timers (the unattended-upgrades
# unit is oneshot). The actual security-origin resolution is proven by the runbook's
# unattended-upgrade --dry-run, not a meaningless apt-config grep.
check "unattended enabled"      "systemctl is-enabled unattended-upgrades"    "enabled"
check "apt-daily-upgrade timer" "systemctl is-enabled apt-daily-upgrade.timer" "enabled"
# NTP: assert the SERVICE is active (deterministic once enabled). "synchronized"
# can legitimately be 'no' for seconds on a fresh box, so don't gate on it.
check "ntp service active"      "timedatectl"                                 "NTP service: active|System clock synchronized: yes"
# Root key backstop: WARN (not FAIL) if absent -- recovery then relies on LISH only.
[ -s /root/.ssh/authorized_keys ] && log "INFO: root key backstop present." \
  || warn "INFO: no /root/.ssh/authorized_keys -- root recovery is LISH-console only."

# ---------------------------------------------------------------------------
# 4B (Task 0.7) — app-runtime checks: Node >= 22.14.0, Caddy, balikha-app
# user, and enabled systemd units.
# ---------------------------------------------------------------------------
# Node version: `node -v` prints "v22.14.0"; strip the 'v' and compare.
# The check() helper only does regex match; version comparison is done inline
# so we can die on mismatch with a useful message rather than a bare FAIL.
if command -v node >/dev/null 2>&1; then
  NODE_VER="$(node -v | sed 's/^v//')"
  NODE_MAJOR="$(printf '%s' "$NODE_VER" | cut -d. -f1)"
  NODE_MINOR="$(printf '%s' "$NODE_VER" | cut -d. -f2)"
  NODE_PATCH="$(printf '%s' "$NODE_VER" | cut -d. -f3)"
  if { [ "${NODE_MAJOR:-0}" -gt 22 ]; } || \
     { [ "${NODE_MAJOR:-0}" -eq 22 ] && [ "${NODE_MINOR:-0}" -gt 14 ]; } || \
     { [ "${NODE_MAJOR:-0}" -eq 22 ] && [ "${NODE_MINOR:-0}" -eq 14 ] && [ "${NODE_PATCH:-0}" -ge 0 ]; }; then
    log "PASS: Node.js ${NODE_VER} >= 22.14.0"
  else
    warn "FAIL: Node.js ${NODE_VER} is < 22.14.0 (required by package.json engines)"; fail=1
  fi
else
  warn "FAIL: node not found in PATH"; fail=1
fi

check "4B caddy active"                "systemctl is-active caddy"                     "^active$"
check "4B caddy enabled"               "systemctl is-enabled caddy"                    "enabled"
check "4B balikha-app user exists"     "id balikha-app"                                "balikha-app"
check "4B balikha.service enabled"     "systemctl is-enabled balikha.service"          "enabled"
check "4B tick timer enabled"          "systemctl is-enabled balikha-orders-tick.timer" "enabled"
check "digest timer enabled"           "systemctl is-enabled balikha-weekly-digest.timer" "enabled"
check "digest OnFailure wired"         "systemctl show -p OnFailure balikha-weekly-digest.service" "balikha-job-failure-alert@"
check "tick OnFailure wired"           "systemctl show -p OnFailure balikha-orders-tick.service"   "balikha-job-failure-alert@"
check "backup OnFailure wired"         "systemctl show -p OnFailure balikha-backup.service"        "balikha-job-failure-alert@"

# ---------------------------------------------------------------------------
# 4D — backup tooling-presence checks (NOT "backups working" — backups cannot
# run until the operator writes /etc/balikha/backup.env; review Issue 8).
# ---------------------------------------------------------------------------
# pg_dump present AND version is 16.x (catches client/server skew; Issue 7).
if command -v pg_dump >/dev/null 2>&1; then
  check "4D pg_dump version 16.x" "pg_dump --version" "^pg_dump \(PostgreSQL\) 16\."
else
  warn "FAIL: 4D pg_dump not found in PATH (install postgresql-client-16)"; fail=1
fi
check "4D aws present"                 "aws --version"                                 "aws-cli"
check "4D backup timer enabled"        "systemctl is-enabled balikha-backup.timer"     "enabled"
# INFO warn: backups won't fire until the operator writes backup.env (Issue 8).
[ -s /etc/balikha/backup.env ] && log "INFO: /etc/balikha/backup.env present." \
  || warn "INFO: /etc/balikha/backup.env not yet written — write it before the first backup runs (see .env.backup.example)."

[ "$fail" -eq 0 ] && log "ALL CHECKS PASSED." || die "One or more checks FAILED (see above)."
