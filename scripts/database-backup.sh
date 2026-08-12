#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "❌ $*" >&2
  exit 1
}

command -v pg_dump >/dev/null 2>&1 || fail "pg_dump is required"
command -v pg_restore >/dev/null 2>&1 || fail "pg_restore is required"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required"

DATABASE_URL="${DATABASE_URL:-}"
[[ -n "$DATABASE_URL" ]] || fail "DATABASE_URL is required"

umask 077
BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "$BACKUP_DIR"

if [[ -n "${BACKUP_FILE:-}" ]]; then
  OUTPUT="$BACKUP_FILE"
else
  OUTPUT="$BACKUP_DIR/business-shield-$(date -u +%Y%m%dT%H%M%SZ).dump"
fi

mkdir -p "$(dirname "$OUTPUT")"
[[ ! -e "$OUTPUT" ]] || fail "Backup file already exists: $OUTPUT"

TMP_FILE="${OUTPUT}.tmp.$$"
trap 'rm -f "$TMP_FILE"' EXIT

pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-acl \
  --file="$TMP_FILE"

pg_restore --list "$TMP_FILE" >/dev/null
mv "$TMP_FILE" "$OUTPUT"
sha256sum "$OUTPUT" > "${OUTPUT}.sha256"
chmod 600 "$OUTPUT" "${OUTPUT}.sha256"
trap - EXIT

echo "✅ PostgreSQL backup created and validated: $OUTPUT"
echo "✅ SHA-256 manifest: ${OUTPUT}.sha256"
