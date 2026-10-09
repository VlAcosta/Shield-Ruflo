#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-https://bis-shield.ru}"
HTTP_BASE_URL="${HTTP_BASE_URL:-http://bis-shield.ru}"
CONNECT_TIMEOUT="${CURL_CONNECT_TIMEOUT:-5}"
MAX_TIME="${CURL_MAX_TIME:-20}"

fail() {
  echo "❌ $*" >&2
  exit 1
}

ok() {
  echo "✅ $*"
}

command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v grep >/dev/null 2>&1 || fail "grep is required"

BASE_URL="${BASE_URL%/}"
HTTP_BASE_URL="${HTTP_BASE_URL%/}"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

fetch_headers() {
  local url="$1"
  local output="$2"
  curl --silent --show-error --location --output /dev/null \
    --dump-header "$output" \
    --connect-timeout "$CONNECT_TIMEOUT" \
    --max-time "$MAX_TIME" \
    "$url"
}

header_value() {
  local file="$1"
  local name="$2"
  awk -v key="$name" '
    BEGIN { IGNORECASE = 1 }
    $0 ~ "^" key ":" {
      sub(/^[^:]+:[[:space:]]*/, "", $0)
      sub(/\r$/, "", $0)
      value = $0
    }
    END { print value }
  ' "$file"
}

root_headers="$tmp_dir/root.headers"
root_body="$tmp_dir/root.html"
curl --silent --show-error --location --fail \
  --dump-header "$root_headers" \
  --output "$root_body" \
  --connect-timeout "$CONNECT_TIMEOUT" \
  --max-time "$MAX_TIME" \
  "$BASE_URL/"

grep -Fq '<title>Business Shield</title>' "$root_body" || fail "Frontend shell marker is missing"
ok "Frontend shell is present"

hsts="$(header_value "$root_headers" 'Strict-Transport-Security')"
[[ "$hsts" == *"max-age="* ]] || fail "HSTS header is missing"
ok "HSTS is present"

csp="$(header_value "$root_headers" 'Content-Security-Policy')"
[[ "$csp" == *"default-src 'self'"* ]] || fail "Frontend CSP is missing or unexpected"
[[ "$csp" == *"frame-ancestors 'none'"* ]] || fail "Frontend CSP does not block framing"
ok "Frontend CSP is present"

[[ "$(header_value "$root_headers" 'X-Content-Type-Options')" == "nosniff" ]] \
  || fail "X-Content-Type-Options must be nosniff"
ok "MIME sniffing protection is present"

[[ "$(header_value "$root_headers" 'X-Frame-Options')" == "DENY" ]] \
  || fail "X-Frame-Options must be DENY"
ok "Frame protection is present"

[[ -n "$(header_value "$root_headers" 'Referrer-Policy')" ]] \
  || fail "Referrer-Policy is missing"
[[ -n "$(header_value "$root_headers" 'Permissions-Policy')" ]] \
  || fail "Permissions-Policy is missing"
ok "Browser privacy headers are present"

asset_path="$(grep -oE '/assets/[^"[:space:]]+\.(js|css)' "$root_body" | head -n 1 || true)"
[[ -n "$asset_path" ]] || fail "Unable to discover a hashed frontend asset"

asset_headers="$tmp_dir/asset.headers"
fetch_headers "$BASE_URL$asset_path" "$asset_headers"
cache_control="$(header_value "$asset_headers" 'Cache-Control')"
[[ "$cache_control" == *"max-age=31536000"* && "$cache_control" == *"immutable"* ]] \
  || fail "Hashed asset cache policy is not immutable for one year: $cache_control"
ok "Hashed frontend assets use immutable one-year caching"

source_map_status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
  --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME" "$BASE_URL${asset_path}.map")"
[[ "$source_map_status" == "404" ]] \
  || fail "Production source maps must not be publicly reachable, got HTTP $source_map_status"
ok "Production source maps are not publicly reachable"

for path in '/.env' '/.git/config' '/backend/.env' '/internal/metrics'; do
  status="$(curl --silent --show-error --output /dev/null --write-out '%{http_code}' \
    --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME" "$BASE_URL$path")"
  [[ "$status" == "404" ]] || fail "$path must return 404, got $status"
done
ok "Sensitive/internal paths are not exposed through SPA fallback"

redirect_headers="$tmp_dir/http.headers"
status="$(curl --silent --show-error --output /dev/null --dump-header "$redirect_headers" \
  --write-out '%{http_code}' --connect-timeout "$CONNECT_TIMEOUT" --max-time "$MAX_TIME" \
  "$HTTP_BASE_URL/")"
[[ "$status" =~ ^30[1278]$ ]] || fail "HTTP origin must redirect to HTTPS, got $status"
location="$(header_value "$redirect_headers" 'Location')"
[[ "$location" == https://* ]] || fail "HTTP redirect does not point to HTTPS: $location"
ok "HTTP redirects to HTTPS"

printf '\nBusiness Shield production security smoke passed.\n'
