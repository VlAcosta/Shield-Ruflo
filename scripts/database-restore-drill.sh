#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "❌ $*" >&2
  exit 1
}

command -v pg_restore >/dev/null 2>&1 || fail "pg_restore is required"
command -v psql >/dev/null 2>&1 || fail "psql is required"
command -v sha256sum >/dev/null 2>&1 || fail "sha256sum is required"
command -v node >/dev/null 2>&1 || fail "node is required"

BACKUP_FILE="${BACKUP_FILE:-}"
RESTORE_DATABASE_URL="${RESTORE_DATABASE_URL:-}"
SOURCE_DATABASE_URL="${SOURCE_DATABASE_URL:-}"

[[ -f "$BACKUP_FILE" ]] || fail "BACKUP_FILE does not exist"
[[ -f "${BACKUP_FILE}.sha256" ]] || fail "Backup SHA-256 manifest is missing"
[[ -n "$RESTORE_DATABASE_URL" ]] || fail "RESTORE_DATABASE_URL is required"
[[ -z "$SOURCE_DATABASE_URL" || "$SOURCE_DATABASE_URL" != "$RESTORE_DATABASE_URL" ]] || fail "Restore target must differ from source database"

RESTORE_DB_NAME="$(node -e 'const u=new URL(process.argv[1]); console.log(u.pathname.replace(/^\/+/, ""))' "$RESTORE_DATABASE_URL")"
[[ "$RESTORE_DB_NAME" =~ (test|restore|drill|e2e|ci) ]] || fail "Refusing restore into non-drill database: $RESTORE_DB_NAME"

(
  cd "$(dirname "$BACKUP_FILE")"
  sha256sum --check "$(basename "$BACKUP_FILE").sha256"
)
pg_restore --list "$BACKUP_FILE" >/dev/null

PUBLIC_TABLES="$(psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"
[[ "$PUBLIC_TABLES" == "0" ]] || fail "Restore target must be empty; found $PUBLIC_TABLES public tables"

pg_restore \
  --dbname="$RESTORE_DATABASE_URL" \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "$BACKUP_FILE"

MIGRATIONS_TABLE="$(psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT to_regclass('public._prisma_migrations') IS NOT NULL;")"
ORGANIZATIONS_TABLE="$(psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT to_regclass('public.organizations') IS NOT NULL;")"
[[ "$MIGRATIONS_TABLE" == "t" ]] || fail "Restored database is missing _prisma_migrations"
[[ "$ORGANIZATIONS_TABLE" == "t" ]] || fail "Restored database is missing organizations"

APPLIED_MIGRATIONS="$(psql "$RESTORE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;")"
[[ "$APPLIED_MIGRATIONS" =~ ^[1-9][0-9]*$ ]] || fail "Restored database has no applied Prisma migrations"

echo "✅ Restore drill completed into guarded database: $RESTORE_DB_NAME"
echo "✅ Applied migrations restored: $APPLIED_MIGRATIONS"
