#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

if [ "$#" -eq 0 ]; then
  echo "Usage:"
  echo "./scripts/run-agent-task.sh \"Approved Business Shield task\""
  exit 1
fi

TASK="$*"

./scripts/agents-preflight.sh

BASE_PROMPT="$(cat .agent-prompts/02-full-stack-implementation.md)"

exec codex \
  --sandbox workspace-write \
  --ask-for-approval on-request \
  "${BASE_PROMPT}

==================================================
APPROVED TASK
==================================================

${TASK}
"
