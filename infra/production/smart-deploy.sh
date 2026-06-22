#!/usr/bin/env bash
set -euo pipefail
# Smart production deploy. Decides — for the current origin/main HEAD — whether
# CI deployed, was billing-blocked (→ deploy locally), or failed for real
# (→ stop). See docs/superpowers/plans/2026-06-22-smart-deploy-fallback.md.
#
# Required env:
#   DEPLOY_HOST   ssh target, e.g. deploy@1.2.3.4
# Prereqs: gh authenticated; infra/production/build.env filled from .example.
cd "$(dirname "$0")/../.." # repo root

HOST="${DEPLOY_HOST:?set DEPLOY_HOST=deploy@host}"
BUILD_ENV="infra/production/build.env"
test -f "$BUILD_ENV" || {
  echo "FATAL: $BUILD_ENV missing — copy build.env.example and fill it"
  exit 1
}

echo "→ syncing main"
git fetch --quiet origin main
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse origin/main)"
if [ "$LOCAL" != "$REMOTE" ]; then
  echo "FATAL: local HEAD ($LOCAL) != origin/main ($REMOTE)."
  echo "       Check out main and pull so you deploy exactly what's on main."
  exit 1
fi
TARGET="$REMOTE"

echo "→ reading the box's currently-deployed commit (best effort)"
DEPLOYED_SHA="$(ssh -o ConnectTimeout=10 "$HOST" 'cat /opt/balikha/current/RELEASE_SHA 2>/dev/null' || true)"

echo "→ deciding"
set +e
DEPLOYED_SHA="$DEPLOYED_SHA" TARGET_SHA="$TARGET" npx tsx scripts/deploy-decide.ts
CODE=$?
set -e

case "$CODE" in
  0) echo "✓ nothing to do (CI already deployed, or box already on this commit)"; exit 0 ;;
  20) echo "… CI run not finished yet — re-run this command shortly"; exit 0 ;;
  1) echo "✗ CI failed for a NON-billing reason — NOT deploying. Investigate the run."; exit 1 ;;
  10) echo "→ billing-blocked: deploying locally" ;;
  *) echo "FATAL: unknown decision exit code $CODE"; exit 1 ;;
esac

echo "→ building with production env"
# shellcheck disable=SC1090
set -a
source "$BUILD_ENV"
set +a
npm ci
npm run build

echo "→ packaging artifact"
ART_DIR="$(mktemp -d)"
ART="$ART_DIR/balikha-deploy-${TARGET}.tar.gz"
# Mirror release.yml's packaging exclusions exactly.
tar --exclude='./.git' --exclude='./node_modules' \
  --exclude='./.env*' --exclude='./.next/cache' \
  -czf "$ART" .

echo "→ deploying release for ${TARGET:0:7}"
RELEASE_SHA="$TARGET" infra/production/deploy.sh "$HOST" "$ART"

rm -rf "$ART_DIR"
echo "✓ smart-deploy complete for ${TARGET:0:7}"
