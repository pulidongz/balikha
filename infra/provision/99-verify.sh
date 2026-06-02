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
check "AC2 80 allowed"          "ufw status"                                  "(^|[^0-9])80/tcp +ALLOW"
check "AC2 443 allowed"         "ufw status"                                  "(^|[^0-9])443/tcp +ALLOW"
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

[ "$fail" -eq 0 ] && log "ALL CHECKS PASSED." || die "One or more checks FAILED (see above)."
