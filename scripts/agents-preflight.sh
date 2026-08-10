#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "=== BUSINESS SHIELD AGENT PREFLIGHT ==="
echo

echo "[1/7] Repository"
git status --short
echo

echo "[2/7] Codex"
codex --version
echo

echo "[3/7] Ruflo"
npx -y ruflo@3.34.0 --version
echo

echo "[4/7] MCP"
codex mcp list
codex mcp list | grep -i ruflo >/dev/null
echo "✅ Ruflo MCP registered"
echo

echo "[5/7] Agent definitions"
python3 - <<'PY'
from pathlib import Path
import tomllib

files = sorted(Path(".codex/agents").glob("*.toml"))
assert len(files) >= 10, f"Expected at least 10 agents, found {len(files)}"

for path in files:
    with path.open("rb") as f:
        data = tomllib.load(f)

    for key in ("name", "description", "developer_instructions"):
        assert data.get(key), f"{path}: missing {key}"

    print(f"✅ {data['name']}")

print("✅ Agent definitions valid")
PY
echo

echo "[6/7] AGENTS.md"
test -s AGENTS.md
grep -q "Mandatory Production Backend Delivery" AGENTS.md
echo "✅ AGENTS.md + backend contract"
echo

echo "[7/7] Ruflo memory"
npx -y ruflo@3.34.0 memory stats

npx -y ruflo@3.34.0 memory search \
  --query "real full stack production backend" \
  --namespace "bs-architecture" \
  --threshold 0.1 \
  --limit 5

echo
echo "======================================="
echo "✅ AGENT PLATFORM READY"
echo "======================================="
