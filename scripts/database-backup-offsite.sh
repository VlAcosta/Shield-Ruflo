#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

BACKUP_ROOT="${BACKUP_ROOT:-}"
ENV_FILE="${BACKUP_OFFSITE_ENV_FILE:-/home/acosta/.config/business-shield/backup-offsite.env}"

[[ -d "$BACKUP_ROOT" ]] || { echo "❌ BACKUP_ROOT is required" >&2; exit 1; }

# Off-site is intentionally optional until credentials are provisioned.
if [[ ! -f "$ENV_FILE" ]]; then
  echo "⚠ Off-site backup disabled: $ENV_FILE is not configured."
  exit 0
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${BACKUP_S3_BUCKET:=}"
: "${BACKUP_S3_REGION:=}"
: "${BACKUP_S3_ENDPOINT:=}"
: "${BACKUP_S3_PREFIX:=business-shield}"
: "${AWS_ACCESS_KEY_ID:=}"
: "${AWS_SECRET_ACCESS_KEY:=}"

if [[ -z "$BACKUP_S3_BUCKET" || -z "$AWS_ACCESS_KEY_ID" || -z "$AWS_SECRET_ACCESS_KEY" ]]; then
  echo "⚠ Off-site backup disabled: bucket/access credentials are incomplete."
  exit 0
fi

command -v aws >/dev/null 2>&1 || {
  echo "❌ aws CLI is required for configured off-site backup" >&2
  exit 1
}

STAMP="$(basename "$BACKUP_ROOT")"
TARGET="s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/$STAMP/"
ARGS=(s3 sync "$BACKUP_ROOT/" "$TARGET" --only-show-errors)
[[ -n "$BACKUP_S3_REGION" ]] && ARGS+=(--region "$BACKUP_S3_REGION")
[[ -n "$BACKUP_S3_ENDPOINT" ]] && ARGS+=(--endpoint-url "$BACKUP_S3_ENDPOINT")

aws "${ARGS[@]}"
echo "✅ Off-site backup uploaded: $TARGET"
