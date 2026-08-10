#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="/workspaces/Shield-Ruflo"
PROMPT_FILE="$PROJECT_ROOT/.agent-prompts/03-autonomous-hardening.md"
LOG_DIR="$PROJECT_ROOT/logs"

cd "$PROJECT_ROOT"

mkdir -p "$LOG_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
LOG_FILE="$LOG_DIR/autonomous-$STAMP.log"
FINAL_FILE="$LOG_DIR/autonomous-$STAMP-final.md"

echo "=============================================="
echo " Business Shield Autonomous Hardening"
echo "=============================================="
echo "Branch: $(git branch --show-current)"
echo "Log:    $LOG_FILE"
echo

if [ ! -s "$PROMPT_FILE" ]; then
  echo "ERROR: autonomous prompt is missing."
  exit 1
fi

if [ "$(git branch --show-current)" = "main" ]; then
  echo "ERROR: autonomous development must not run on main."
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "ERROR: tracked worktree changes already exist."
  echo "Review them before starting an autonomous run."
  git status --short
  exit 1
fi

echo "[1/5] Codex"
codex --version

echo "[2/5] Ruflo MCP registration"
codex mcp list | grep -i ruflo

echo "[3/5] Ruflo standalone test"
npx -y ruflo@3.34.0 mcp start --test

echo "[4/5] Agent preflight"
./scripts/agents-preflight.sh

echo "[5/5] Starting autonomous Codex run"
echo

codex \
  -a on-request \
  -c 'approvals_reviewer="auto_review"' \
  -c 'mcp_servers.ruflo.required=true' \
  -c 'mcp_servers.ruflo.startup_timeout_sec=60' \
  -c 'mcp_servers.ruflo.tool_timeout_sec=180' \
  -c 'mcp_servers.ruflo.cwd="/workspaces/Shield-Ruflo"' \
  exec \
  --sandbox workspace-write \
  --output-last-message "$FINAL_FILE" \
  "$(<"$PROMPT_FILE")" \
  2>&1 | tee "$LOG_FILE"

STATUS=${PIPESTATUS[0]}

echo
echo "=============================================="

if [ "$STATUS" -eq 0 ]; then
  echo " AUTONOMOUS RUN COMPLETED"
else
  echo " AUTONOMOUS RUN FAILED: exit=$STATUS"
fi

echo " Final report: $FINAL_FILE"
echo " Full log:    $LOG_FILE"
echo "=============================================="

exit "$STATUS"
