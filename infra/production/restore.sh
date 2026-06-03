#!/usr/bin/env bash
set -euo pipefail
# Restore a Balikha backup from R2 into a target database (4D).
# Canonical invocation (sources the backup creds inside a root shell — the
# one form the runbook uses too; review Issue 10):
#   sudo bash -c 'set -a; source /etc/balikha/backup.env; set +a; \
#     /opt/balikha/current/infra/production/restore.sh <s3-key> <target-db>'
#   <s3-key>     e.g. daily/balikha-20260603-020000.dump
#   <target-db>  e.g. balikha_restore_test  (NEVER the live 'balikha' DB)
# Requires AWS_* + BACKUP_S3_* in the environment.
KEY="${1:?s3 key required, e.g. daily/balikha-<ts>.dump}"
TARGET_DB="${2:?target database required (use a scratch DB, not 'balikha')}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET required}"
: "${BACKUP_S3_ENDPOINT:?BACKUP_S3_ENDPOINT required}"

if [ "$TARGET_DB" = "balikha" ]; then
  echo "FATAL: refusing to restore over the live 'balikha' database."
  echo "       Use a scratch DB (e.g. balikha_restore_test) and verify there."
  exit 1
fi

TMP="$(mktemp /tmp/balikha-restore.XXXXXX.dump)"
trap 'rm -f "$TMP"' EXIT
echo "→ downloading s3://${BACKUP_S3_BUCKET}/${KEY}"
aws s3 cp "s3://${BACKUP_S3_BUCKET}/${KEY}" "$TMP" --endpoint-url "$BACKUP_S3_ENDPOINT"
# pg_restore below runs as the postgres user (it connects to the DB), but $TMP
# is root-owned 0600 from mktemp. Hand it to postgres so it can read the dump.
chown postgres: "$TMP"

echo "→ (re)creating scratch DB ${TARGET_DB}"
sudo -u postgres dropdb --if-exists "$TARGET_DB"
sudo -u postgres createdb -O balikha "$TARGET_DB"

echo "→ restoring into ${TARGET_DB}"
sudo -u postgres pg_restore --no-owner --role=balikha -d "$TARGET_DB" "$TMP"
echo "✓ restored ${KEY} into ${TARGET_DB}"
echo "  verify, then drop:  sudo -u postgres dropdb ${TARGET_DB}"
