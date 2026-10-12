#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

ROOT="${APP_DIR:-/var/www/bis-shield}"
ENV_FILE="${BACKEND_ENV_FILE:-$ROOT/backend/.env}"
BACKUP_BASE="${BACKUP_BASE:-/home/acosta/business-shield-backups/daily}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
LOCK_FILE="${BACKUP_LOCK_FILE:-$BACKUP_BASE/.daily-backup.lock}"
MONITORING_ENV_FILE="${BACKUP_MONITORING_ENV_FILE:-/home/acosta/.config/business-shield/monitoring.env}"
BETTERSTACK_BACKUP_HEARTBEAT_URL=""

fail(){ echo "❌ $*" >&2; exit 1; }
ok(){ echo "✅ $*"; }

heartbeat_success() {
  [[ -n "$BETTERSTACK_BACKUP_HEARTBEAT_URL" ]] || return 0
  curl --silent --show-error --fail --max-time 10 "$BETTERSTACK_BACKUP_HEARTBEAT_URL" >/dev/null || true
}

heartbeat_failure() {
  [[ -n "$BETTERSTACK_BACKUP_HEARTBEAT_URL" ]] || return 0
  curl --silent --show-error --fail --max-time 10 "${BETTERSTACK_BACKUP_HEARTBEAT_URL%/}/fail" >/dev/null || true
}

on_exit() {
  local status=$?
  if [[ $status -eq 0 ]]; then
    heartbeat_success
  else
    heartbeat_failure
  fi
}
trap on_exit EXIT

if [[ -f "$MONITORING_ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$MONITORING_ENV_FILE"
  set +a
  BETTERSTACK_BACKUP_HEARTBEAT_URL="${BETTERSTACK_BACKUP_HEARTBEAT_URL:-}"
fi

[[ -f "$ENV_FILE" ]] || fail "Backend env file not found: $ENV_FILE"
[[ "$RETENTION_DAYS" =~ ^[1-9][0-9]*$ ]] || fail "BACKUP_RETENTION_DAYS must be a positive integer"
command -v flock >/dev/null 2>&1 || fail "flock is required"

exec 9>"$LOCK_FILE"
flock -n 9 || fail "Another Business Shield backup is already running"

DATABASE_URL="$(
  node - "$ENV_FILE" <<'NODE'
const fs = require('fs');
const path = process.argv[2];
const text = fs.readFileSync(path, 'utf8');
const line = text.split(/\r?\n/).find((entry) => entry.startsWith('DATABASE_URL='));
if (!line) process.exit(2);
process.stdout.write(line.slice('DATABASE_URL='.length).trim().replace(/^['"]|['"]$/g, ''));
NODE
)"
[[ -n "$DATABASE_URL" ]] || fail "DATABASE_URL is missing"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DEST="$BACKUP_BASE/$STAMP"
mkdir -p "$DEST"
chmod 700 "$DEST"

DATABASE_URL="$DATABASE_URL" BACKUP_DIR="$DEST" bash "$ROOT/scripts/database-backup.sh"
install -m 600 "$ENV_FILE" "$DEST/backend.env"

BACKUP_FILE="$(find "$DEST" -maxdepth 1 -type f -name '*.dump' -print -quit)"
[[ -n "$BACKUP_FILE" ]] || fail "Backup dump was not created"

cat > "$DEST/backup-metadata.txt" <<META
created_at_utc=$STAMP
source=scheduled_daily
hostname=$(hostname)
retention_days=$RETENTION_DAYS
META
chmod 600 "$DEST/backup-metadata.txt"

# Delete only timestamp-named daily backup directories older than retention.
find "$BACKUP_BASE" -mindepth 1 -maxdepth 1 -type d \
  -regextype posix-extended -regex '.*/[0-9]{8}T[0-9]{6}Z' \
  -mtime +"$RETENTION_DAYS" -print -exec rm -rf -- {} +

# Optional off-site upload. The uploader exits cleanly when disabled.
if [[ -x "$ROOT/scripts/database-backup-offsite.sh" ]]; then
  BACKUP_ROOT="$DEST" bash "$ROOT/scripts/database-backup-offsite.sh"
fi

ok "Daily backup completed: $DEST"
