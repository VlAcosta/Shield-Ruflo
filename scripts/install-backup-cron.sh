#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/var/www/bis-shield}"
SCHEDULE="${BACKUP_CRON_SCHEDULE:-30 3 * * *}"
MARKER="# business-shield-daily-backup"
COMMAND="cd $APP_DIR && bash scripts/database-backup-daily.sh >> /home/acosta/business-shield-backups/daily-backup.log 2>&1"

CURRENT="$(crontab -l 2>/dev/null || true)"
FILTERED="$(printf '%s\n' "$CURRENT" | grep -vF "$MARKER" | grep -vF "scripts/database-backup-daily.sh" || true)"
{
  printf '%s\n' "$FILTERED"
  printf '%s %s %s\n' "$SCHEDULE" "$COMMAND" "$MARKER"
} | awk 'NF' | crontab -

echo "✅ Installed Business Shield daily backup cron: $SCHEDULE"
crontab -l | grep -F "$MARKER"
