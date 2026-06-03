#!/usr/bin/env bash
set -euo pipefail
# Nightly Balikha DB backup → private R2 (4D). Run by balikha-backup.service
# (root), which loads /etc/balikha/backup.env. pg_dump connects as the
# postgres system user via peer auth — no DB password needed.
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET required (from /etc/balikha/backup.env)}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT required}"

# Fixed-width, zero-padded UTC stamp: lexical sort == chronological. The
# prune() below RELIES on this — don't change the format without updating it
# (review Issue 6).
TS="$(date -u +%Y%m%d-%H%M%S)"
DOW="$(date -u +%u)"          # 1=Mon … 7=Sun
DUMP="balikha-${TS}.dump"

aws_s3() { aws s3 "$@" --endpoint-url "$BACKUP_S3_ENDPOINT"; }

# Dump to a local temp file (NOT streamed) so the dump can be VALIDATED
# before upload — a mid-dump failure then never lands a truncated object in
# R2 (review Issue 5). The pre-launch DB is tiny, so a temp file is cheap.
TMP="$(mktemp /var/tmp/balikha-backup.XXXXXX.dump)"
trap 'rm -f "$TMP"' EXIT
echo "→ dumping balikha → ${TMP}"
sudo -u postgres pg_dump -Fc balikha > "$TMP"
echo "→ validating dump (pg_restore --list)"
sudo -u postgres pg_restore --list "$TMP" >/dev/null \
  || { echo "FATAL: dump failed validation — not uploading"; exit 1; }
echo "→ uploading daily/${DUMP}"
aws_s3 cp "$TMP" "s3://${BACKUP_S3_BUCKET}/daily/${DUMP}"

if [ "$DOW" = "7" ]; then
  echo "→ Sunday: weekly snapshot weekly/${DUMP}"
  aws_s3 cp "s3://${BACKUP_S3_BUCKET}/daily/${DUMP}" \
           "s3://${BACKUP_S3_BUCKET}/weekly/${DUMP}"
fi

# Retention: keep newest 7 daily, newest 4 weekly. Keys are date-stamped so
# a lexical sort is chronological; delete the oldest beyond the keep count.
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
prune daily 7
prune weekly 4
echo "✓ backup complete: ${DUMP}"
