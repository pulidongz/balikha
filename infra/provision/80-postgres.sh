#!/usr/bin/env bash
source "$(dirname "$0")/lib/common.sh"
require_root

PG_VERSION=16
DB_NAME="${DB_NAME:-balikha}"
DB_USER="${DB_USER:-balikha}"
# No fallback: refuse to create a DB role without an explicit password.
: "${DB_PASSWORD:?Set DB_PASSWORD to the production DB role password (store it in your secrets manager; 4B puts it in /etc/balikha/production.env).}"

if ! command -v psql >/dev/null 2>&1; then
  log "Adding the PGDG apt repo via the official postgresql-common script."
  apt-get install -y postgresql-common
  # Officially maintained + idempotent: provisions the repo AND the current
  # signing key, so there's no hardcoded legacy key URL to rot.
  /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh -y
  apt-get install -y "postgresql-${PG_VERSION}"
else
  log "PostgreSQL already installed -- ensuring config + role/db."
fi

PGCONF="/etc/postgresql/${PG_VERSION}/main"

# Fail loudly if the expected v16 'main' cluster isn't present, rather than
# writing config into a path that masks a missing/partial install.
[ -d "$PGCONF" ] || die "No PG cluster at $PGCONF -- check 'pg_lsclusters' (expected one postgresql-${PG_VERSION} 'main')."

log "Binding PostgreSQL to localhost only (AC3) + 1 GB tuning."
install -d "${PGCONF}/conf.d"   # default on the PGDG layout; guard if absent
cat > "${PGCONF}/conf.d/10-balikha.conf" <<'EOF'
# Balikha 4A: localhost-only bind + tuning for a 1 GB box coexisting with Node.
listen_addresses = 'localhost'
# 20 is ample for a single next start instance (postgres.js pools ~10) and
# caps the work_mem blast radius on a 1 GB box. Raise on resize.
max_connections = 20
shared_buffers = 128MB
effective_cache_size = 384MB
work_mem = 8MB
maintenance_work_mem = 64MB
wal_compression = on
EOF
# Some packages don't include conf.d by default -- ensure it's included.
ensure_line "include_dir = 'conf.d'" "${PGCONF}/postgresql.conf"

log "Enforcing scram-sha-256 for local + loopback in pg_hba.conf."
cat > "${PGCONF}/pg_hba.conf" <<'EOF'
# Balikha 4A pg_hba: localhost only. No host line for non-loopback addresses.
local   all             postgres                                peer
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
EOF

systemctl enable postgresql
systemctl restart postgresql

log "Ensuring role '${DB_USER}' and database '${DB_NAME}' (idempotent)."
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" | grep -q 1; then
  sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE ${DB_USER} LOGIN PASSWORD '${DB_PASSWORD}';
SQL
fi
# Converge on a rotated secret on every run:
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
ALTER ROLE ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';
SQL
sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 || sudo -u postgres createdb -O "${DB_USER}" "${DB_NAME}"

log "PostgreSQL ${PG_VERSION} ready (localhost-only). DATABASE_URL for 4B:"
log "  postgres://${DB_USER}:<password>@127.0.0.1:5432/${DB_NAME}"
