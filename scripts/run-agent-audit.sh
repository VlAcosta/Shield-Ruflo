#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

./scripts/agents-preflight.sh

exec codex \
  --sandbox read-only \
  --ask-for-approval on-request \
  "$(cat .agent-prompts/01-architecture-audit.md)"
