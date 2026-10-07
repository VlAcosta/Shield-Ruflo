#!/usr/bin/env bash
set -euo pipefail

ROOT="${APP_DIR:-/var/www/bis-shield}"
BACKEND="$ROOT/backend"
API_URL="${API_URL:-http://127.0.0.1:8081}"

fail() {
  echo "❌ $*" >&2
  exit 1
}

ok() {
  echo "✅ $*"
}

[[ -d "$ROOT" ]] || fail "Project directory not found: $ROOT"
[[ -f "$ROOT/build/index.html" ]] || fail "Frontend production build is missing"
[[ -f "$BACKEND/dist/server.js" ]] || fail "Backend API build is missing"
[[ -f "$BACKEND/dist/worker.js" ]] || fail "Backend worker build is missing"
[[ -f "$BACKEND/.env" ]] || fail "Backend .env is missing"

CURRENT_SHA="$(git -C "$ROOT" rev-parse --verify HEAD 2>/dev/null)" || fail "Project directory is not a valid Git checkout"
TRACKED_DIRTY="$(git -C "$ROOT" status --porcelain --untracked-files=no)" || fail "Unable to inspect Git working tree"
[[ -z "$TRACKED_DIRTY" ]] || fail "Tracked production files contain local modifications"

if [[ -n "${EXPECTED_SHA:-}" ]]; then
  EXPECTED_COMMIT="$(git -C "$ROOT" rev-parse --verify "${EXPECTED_SHA}^{commit}" 2>/dev/null)" \
    || fail "EXPECTED_SHA does not resolve to a commit in the production checkout: $EXPECTED_SHA"
  [[ "$CURRENT_SHA" == "$EXPECTED_COMMIT" ]] \
    || fail "Production SHA mismatch: expected $EXPECTED_COMMIT, found $CURRENT_SHA"
  ok "Production Git SHA matches EXPECTED_SHA ($CURRENT_SHA)"
else
  ok "Production Git checkout is clean at $CURRENT_SHA (EXPECTED_SHA not provided)"
fi

ok "Production artifacts exist"

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
NODE_MINOR="$(node -p "Number(process.versions.node.split('.')[1])")"
if (( NODE_MAJOR < 22 || NODE_MAJOR >= 25 || (NODE_MAJOR == 22 && NODE_MINOR < 12) )); then
  fail "Node.js >=22.12 <25 is required; found $(node --version)"
fi
ok "Node.js $(node --version)"

cd "$BACKEND"

node --input-type=module <<'NODE'
const { env } = await import('./dist/config/env.js');
const { operationsConfig } = await import('./dist/config/operations.config.js');
if (env.NODE_ENV !== 'production' || operationsConfig.NODE_ENV !== 'production') {
  throw new Error(`NODE_ENV must be production for release, got app=${env.NODE_ENV}, operations=${operationsConfig.NODE_ENV}`);
}
if (!env.PLATFORM_ADMIN_IDENTITIES.length) {
  console.warn('⚠ PLATFORM_ADMIN_IDENTITIES is empty: /admin will be denied for everyone.');
}
if (operationsConfig.OPERATIONS_METRICS_TOKEN.length < 32) {
  throw new Error('OPERATIONS_METRICS_TOKEN must be at least 32 characters');
}
console.log('✅ Backend production environment passed schema, security, and operational validation');
NODE

npm run db:status
ok "Prisma migration status checked"

if command -v systemctl >/dev/null 2>&1; then
  systemctl is-active --quiet bis-shield-api || fail "bis-shield-api is not active"
  systemctl is-active --quiet bis-shield-worker || fail "bis-shield-worker is not active"
  ok "API and worker systemd services are active"
fi

curl -fsS "$API_URL/health" >/dev/null || fail "API health endpoint failed"
curl -fsS "$API_URL/health/ready" >/dev/null || fail "API readiness endpoint failed"
ok "API and PostgreSQL readiness are healthy"

printf '\nBusiness Shield production preflight passed.\n'
