#!/usr/bin/env bash
set -euo pipefail
# Balikha DB backup → private R2 (4D). Run by balikha-backup.service (root,
# nightly) OR invoked directly by deploy.sh with the 'predeploy' mode. pg_dump
# connects as the postgres system user via peer auth — no DB password needed.
#
# Usage: backup.sh [nightly|predeploy]   (default: nightly)
#   nightly   → daily/ (+ a weekly/ copy on Sundays); prunes daily 7, weekly 4
#   predeploy → predeploy/ (pre-migration snapshots taken by deploys); prunes 10
# Separate prefixes so deploy-time snapshots never evict the nightly daily/
# retention pool (review HIGH/MEDIUM — push-to-main CD can deploy many times/day).
MODE="${1:-nightly}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET required (from /etc/balikha/backup.env)}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID required (fill in /etc/balikha/backup.env)}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY required (fill in /etc/balikha/backup.env)}"

case "$MODE" in
  nightly)   PREFIX=daily ;;
  predeploy) PREFIX=predeploy ;;
  *) echo "FATAL: unknown mode '$MODE' (expected nightly|predeploy)"; exit 1 ;;
esac

# Fixed-width, zero-padded UTC stamp: lexical sort == chronological. prune()
# RELIES on this — don't change the format without updating it.
TS="$(date -u +%Y%m%d-%H%M%S)"
DOW="$(date -u +%u)"          # 1=Mon … 7=Sun
DUMP="balikha-${TS}.dump"

aws_s3() { aws s3 "$@" --endpoint-url "$BACKUP_S3_ENDPOINT"; }

# Dump to a local temp file (NOT streamed) so the dump can be VALIDATED before
# upload — a mid-dump failure then never lands a truncated object in R2.
TMP="$(mktemp /var/tmp/balikha-backup.XXXXXX.dump)"
trap 'rm -f "$TMP"' EXIT
echo "→ dumping balikha (${MODE}) → ${TMP}"
sudo -u postgres pg_dump -Fc balikha > "$TMP"
echo "→ validating dump (pg_restore --list)"
# Run as ROOT, not postgres: `pg_restore --list` only reads the dump's TOC (no
# DB connection), and $TMP is root-owned 0600 from mktemp — the postgres user
# can't read it, so `sudo -u postgres pg_restore --list` fails Permission denied.
pg_restore --list "$TMP" >/dev/null \
  || { echo "FATAL: dump failed validation — not uploading"; exit 1; }
echo "→ uploading ${PREFIX}/${DUMP}"
aws_s3 cp "$TMP" "s3://${BACKUP_S3_BUCKET}/${PREFIX}/${DUMP}"

# Nightly only: keep a weekly snapshot on Sundays.
if [ "$MODE" = "nightly" ] && [ "$DOW" = "7" ]; then
  echo "→ Sunday: weekly snapshot weekly/${DUMP}"
  aws_s3 cp "s3://${BACKUP_S3_BUCKET}/${PREFIX}/${DUMP}" \
           "s3://${BACKUP_S3_BUCKET}/weekly/${DUMP}"
fi

# Retention: keys are date-stamped so a lexical sort is chronological; delete
# the oldest beyond the keep count.
prune() {
  local prefix="$1" keep="$2" n
  mapfile -t keys < <(aws_s3 ls "s3://${BACKUP_S3_BUCKET}/${prefix}/" \
                      | awk '{print $4}' | grep -E '\.dump$' | sort)
  n=${#keys[@]}
  if [ "$n" -gt "$keep" ]; then
    for k in "${keys[@]:0:$((n-keep))}"; do
      echo "→ pruning ${prefix}/${k}"
      aws_s3 rm "s3://${BACKUP_S3_BUCKET}/${prefix}/${k}"
    done
  fi
}
if [ "$MODE" = "nightly" ]; then
  prune daily 7
  prune weekly 4
else
  prune predeploy 10
fi
echo "✓ backup complete (${MODE}): ${PREFIX}/${DUMP}"
