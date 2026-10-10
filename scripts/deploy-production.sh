#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${BRANCH:-release/p27-security-unified-2026-08-28}"
TARGET_SHA="${TARGET_SHA:-${1:-}}"
BASE_URL="${BASE_URL:-https://bis-shield.ru}"
BACKUP_BASE="${BACKUP_BASE:-$HOME/business-shield-backups}"
API_SERVICE="${API_SERVICE:-bis-shield-api.service}"
WORKER_SERVICE="${WORKER_SERVICE:-bis-shield-worker.service}"

fail() {
  echo "❌ $*" >&2
  exit 1
}

ok() {
  echo "✅ $*"
}

[[ "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]] || fail "TARGET_SHA must be a full 40-character commit SHA"

for command_name in git node npm curl systemctl sha256sum; do
  command -v "$command_name" >/dev/null 2>&1 || fail "$command_name is required"
done

cd "$ROOT"

[[ -z "$(git status --porcelain --untracked-files=no)" ]]   || fail "Tracked production files are modified; refusing deployment"

PREVIOUS_SHA="$(git rev-parse HEAD)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_ROOT="$BACKUP_BASE/$STAMP"
REMOTE_REF="refs/remotes/origin/$BRANCH"

mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"

echo "Business Shield production deploy"
echo "Branch:   $BRANCH"
echo "Current:  $PREVIOUS_SHA"
echo "Target:   $TARGET_SHA"
echo "Backup:   $BACKUP_ROOT"

GIT_TERMINAL_PROMPT=0 git fetch origin "+refs/heads/$BRANCH:$REMOTE_REF"
REMOTE_SHA="$(git rev-parse "$REMOTE_REF")"
[[ "$REMOTE_SHA" == "$TARGET_SHA" ]]   || fail "Remote branch head is $REMOTE_SHA, expected $TARGET_SHA"
ok "Exact release SHA verified"

install -m 600 backend/.env "$BACKUP_ROOT/backend.env"
cp scripts/database-backup.sh "$BACKUP_ROOT/database-backup.sh"
chmod 700 "$BACKUP_ROOT/database-backup.sh"

DATABASE_URL="$(
  cd backend
  node --input-type=module -e "import 'dotenv/config'; if (!process.env.DATABASE_URL) process.exit(2); process.stdout.write(process.env.DATABASE_URL);"
)"
BACKUP_DIR="$BACKUP_ROOT" DATABASE_URL="$DATABASE_URL"   bash "$BACKUP_ROOT/database-backup.sh"
unset DATABASE_URL
(
  cd "$BACKUP_ROOT"
  sha256sum -c ./*.dump.sha256
)
ok "Database and environment backup validated"

git switch -C "$BRANCH" "$REMOTE_REF"
[[ "$(git rev-parse HEAD)" == "$TARGET_SHA" ]]   || fail "Checkout does not match target SHA"
ok "Production checkout updated"

npm ci
rm -rf build.next
npm run build -- --outDir build.next
[[ -s build.next/index.html ]] || fail "Frontend staging build is missing index.html"
if find build.next -type f -name '*.map' -print -quit | grep -q .; then
  fail "Frontend staging build contains source maps"
fi
ok "Frontend staging build completed"

(
  cd backend
  npm ci
  npm run prisma:generate
  npm run typecheck
  npm run build
  npm run db:status
  npm run db:deploy
  npm run db:status
)
ok "Backend build and migration gate completed"

if [[ -d build ]]; then
  cp -a build "$BACKUP_ROOT/frontend-build-prev"
fi

ROLLBACK_BUILD="build.rollback.$STAMP"
rm -rf "$ROLLBACK_BUILD"
mv build "$ROLLBACK_BUILD"
if ! mv build.next build; then
  mv "$ROLLBACK_BUILD" build
  fail "Frontend activation failed; previous build restored"
fi
ok "Frontend build activated"

systemctl --no-ask-password restart "$API_SERVICE"
systemctl --no-ask-password restart "$WORKER_SERVICE"
sleep 3

[[ "$(systemctl is-active "$API_SERVICE")" == "active" ]] || fail "$API_SERVICE is not active"
[[ "$(systemctl is-active "$WORKER_SERVICE")" == "active" ]] || fail "$WORKER_SERVICE is not active"

curl -fsS http://127.0.0.1:8081/health >/dev/null
curl -fsS http://127.0.0.1:8081/health/ready >/dev/null
ok "API, worker, and database readiness are healthy"

EXPECTED_SHA="$TARGET_SHA" bash scripts/production-preflight.sh
BASE_URL="$BASE_URL" bash scripts/production-smoke.sh
BASE_URL="$BASE_URL" bash scripts/production-security-smoke.sh

cat > "$BACKUP_ROOT/deploy-metadata.txt" <<META
deployed_at_utc=$STAMP
previous_sha=$PREVIOUS_SHA
target_sha=$TARGET_SHA
branch=$BRANCH
base_url=$BASE_URL
META

rm -rf "$ROLLBACK_BUILD"

echo
ok "Production deployment completed at $TARGET_SHA"
echo "Rollback artifacts: $BACKUP_ROOT"
