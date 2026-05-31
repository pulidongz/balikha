#!/usr/bin/env bash
# Shared helpers for Balikha host-provisioning scripts (ticket #18 / 4A).
# Source this at the top of every NN-*.sh script:
#   source "$(dirname "$0")/lib/common.sh"
set -euo pipefail

log()  { printf '\033[1;32m[provision]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[warn]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[error]\033[0m %s\n' "$*" >&2; exit 1; }

require_root() {
  [ "$(id -u)" -eq 0 ] || die "Run as root (or via sudo). Current uid: $(id -u)."
}

require_ubuntu_2404() {
  # No fallback: refuse to run on an unexpected OS rather than guessing
  # apt/package names for it (CLAUDE.md: no silent defaults).
  . /etc/os-release 2>/dev/null || die "Cannot read /etc/os-release."
  [ "${ID:-}" = "ubuntu" ] || die "Expected Ubuntu, found ID=${ID:-unknown}."
  [ "${VERSION_ID:-}" = "24.04" ] || die "Expected Ubuntu 24.04, found ${VERSION_ID:-unknown}."
}

# Idempotent: ensure an exact line is present in a file, appending only if
# absent. Never double-appends on re-run. Creates the file if missing.
ensure_line() {
  local line="$1" file="$2"
  touch "$file"
  grep -qxF "$line" "$file" || printf '%s\n' "$line" >> "$file"
}

confirm() {
  local prompt="$1" reply
  read -r -p "$prompt [yes/no] " reply
  [ "$reply" = "yes" ]
}

DEPLOY_USER="${DEPLOY_USER:-deploy}"
export DEPLOY_USER
