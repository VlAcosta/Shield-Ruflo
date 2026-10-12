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
  console.warn('⚠ PLATFORM_ADMIN_IDENTITIES is empty: /admin requires a persisted active platform manager.');
}
if (env.AI_REVIEW_INTELLIGENCE_ENABLED) {
  if (env.AI_PROVIDER === 'openai' && (!env.AI_OPENAI_API_KEY || !env.AI_OPENAI_MODEL)) {
    throw new Error('OpenAI provider is enabled but AI_OPENAI_API_KEY/AI_OPENAI_MODEL are not configured');
  }
  if (env.AI_PROVIDER === 'mistral' && (!env.AI_MISTRAL_API_KEY || !env.AI_MISTRAL_MODEL)) {
    throw new Error('Mistral provider is enabled but AI_MISTRAL_API_KEY/AI_MISTRAL_MODEL are not configured');
  }
  if (env.AI_PROVIDER === 'self_hosted' && (!env.AI_SELF_HOSTED_BASE_URL || !env.AI_SELF_HOSTED_MODEL)) {
    throw new Error('Self-hosted AI is enabled but AI_SELF_HOSTED_BASE_URL/AI_SELF_HOSTED_MODEL are not configured');
  }
  const model = env.AI_PROVIDER === 'mistral'
    ? env.AI_MISTRAL_MODEL
    : env.AI_PROVIDER === 'self_hosted'
      ? env.AI_SELF_HOSTED_MODEL
      : env.AI_OPENAI_MODEL;
  console.log(`✅ AI activation configured (provider=${env.AI_PROVIDER}, model=${model})`);
} else {
  console.warn('⚠ AI_REVIEW_INTELLIGENCE_ENABLED=false: Review Intelligence, Reply Copilot, Ask Shield and AI Visibility provider calls remain disabled.');
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

if [[ -n "${OPERATIONS_METRICS_TOKEN:-}" ]]; then
  AI_HEALTH="$(curl -fsS -H "x-operations-token: $OPERATIONS_METRICS_TOKEN" "$API_URL/internal/ai/health")" \
    || fail "AI readiness endpoint failed"
  AI_AVAILABLE="$(printf '%s' "$AI_HEALTH" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{const v=JSON.parse(s);process.stdout.write(v.available ? "true" : "false")})')"
  if grep -q '^AI_REVIEW_INTELLIGENCE_ENABLED=true$' "$BACKEND/.env"; then
    [[ "$AI_AVAILABLE" == "true" ]] || fail "AI is enabled in .env but /internal/ai/health reports unavailable"
    ok "AI provider readiness reports available"
  else
    ok "AI readiness endpoint reachable (provider intentionally disabled)"
  fi
else
  echo "⚠ OPERATIONS_METRICS_TOKEN shell variable not supplied; skipping protected AI readiness HTTP probe."
fi

printf '\nBusiness Shield production preflight passed.\n'
