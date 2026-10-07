#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://bis-shield.ru}"
CURL_CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-5}"
CURL_MAX_TIME="${CURL_MAX_TIME:-20}"

fail() {
  echo "❌ $*" >&2
  exit 1
}

ok() {
  echo "✅ $*"
}

command -v curl >/dev/null 2>&1 || fail "curl is required"

BASE_URL="${BASE_URL%/}"
[[ "$BASE_URL" == https://* ]] || fail "BASE_URL must use HTTPS: $BASE_URL"

status_for() {
  local path="$1"
  curl \
    --silent \
    --show-error \
    --location \
    --output /dev/null \
    --write-out '%{http_code}' \
    --connect-timeout "$CURL_CONNECT_TIMEOUT" \
    --max-time "$CURL_MAX_TIME" \
    --retry 2 \
    --retry-delay 1 \
    --retry-all-errors \
    "$BASE_URL$path"
}

expect_status() {
  local path="$1"
  local expected="$2"
  local label="$3"
  local actual

  actual="$(status_for "$path")" || fail "$label request failed: $BASE_URL$path"
  [[ "$actual" == "$expected" ]] || fail "$label expected HTTP $expected, got $actual: $BASE_URL$path"
  ok "$label returned HTTP $actual"
}

body_for() {
  local path="$1"
  curl \
    --silent \
    --show-error \
    --location \
    --fail \
    --connect-timeout "$CURL_CONNECT_TIMEOUT" \
    --max-time "$CURL_MAX_TIME" \
    --retry 2 \
    --retry-delay 1 \
    --retry-all-errors \
    "$BASE_URL$path"
}

expect_body_contains() {
  local path="$1"
  local needle="$2"
  local label="$3"
  local body

  body="$(body_for "$path")" || fail "$label request failed: $BASE_URL$path"
  grep -Fq -- "$needle" <<<"$body" || fail "$label did not contain expected marker: $needle"
  ok "$label contains expected marker"
}

printf 'Business Shield external production smoke\n'
printf 'Target: %s\n\n' "$BASE_URL"

expect_status "/" "200" "Frontend root"
expect_body_contains "/" "<title>Business Shield</title>" "Frontend shell"
expect_status "/reviews" "200" "SPA reviews route"
expect_status "/api/v1/meta" "200" "Public API metadata"
expect_body_contains "/api/v1/meta" "\"environment\":\"production\"" "API production environment"
expect_body_contains "/api/v1/meta" "\"apiVersion\":\"v1\"" "API version"
expect_status "/api/v1/me" "401" "Unauthenticated API auth boundary"

printf '\nBusiness Shield external production smoke passed.\n'
