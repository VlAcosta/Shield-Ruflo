#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/workspaces/Shield-Ruflo"
MASTER="$ROOT/.agent-prompts/MASTER_P0_P12.md"
SCHEMA="$ROOT/.agent-prompts/stage-result.schema.json"

STATE="$ROOT/.agent-state/p0-p12"
LOGS="$ROOT/logs/p0p12"
CHECKPOINTS="$STATE/checkpoints"

mkdir -p "$STATE" "$LOGS" "$CHECKPOINTS"

cd "$ROOT"

echo "======================================================"
echo " BUSINESS SHIELD AUTONOMOUS P0-P12"
echo "======================================================"
echo "Branch: $(git branch --show-current)"
echo

if [[ "$(git branch --show-current)" == "main" ]]; then
  echo "❌ Refusing autonomous development on main."
  exit 1
fi

if [[ ! -s "$MASTER" ]]; then
  echo "❌ Missing master specification:"
  echo "$MASTER"
  exit 1
fi

if [[ ! -s "$SCHEMA" ]]; then
  echo "❌ Missing result schema:"
  echo "$SCHEMA"
  exit 1
fi

echo "[PRECHECK] Codex"
codex --version

echo
echo "[PRECHECK] Ruflo registration"
codex mcp list | grep -i ruflo

echo
echo "[PRECHECK] Ruflo standalone"
npx -y ruflo@3.34.0 mcp start --test

echo
echo "[PRECHECK] Agents"
./scripts/agents-preflight.sh

git status --short > "$STATE/baseline-git-status.txt"
git diff --binary > "$STATE/baseline.patch" || true

run_stage() {
  local stage="$1"
  local instruction="$2"

  local finished="$STATE/${stage}.finished"
  local max_attempts="${MAX_STAGE_ATTEMPTS:-4}"

  if [[ -f "$finished" ]]; then
    echo
    echo "======================================================"
    echo " SKIP $stage — already finished"
    echo "======================================================"
    return 0
  fi

  local attempt=1

  if [[ "$stage" == "P0" ]] && [[ -s "$STATE/P0_REPAIR_CONTEXT.md" ]]; then
    instruction="${instruction}

==================================================
KNOWN P0 REPAIR CONTEXT
==================================================

$(cat "$STATE/P0_REPAIR_CONTEXT.md")
"
  fi

  while [[ "$attempt" -le "$max_attempts" ]]; do
    local result="$STATE/${stage}.json"
    local attempt_result="$STATE/${stage}-attempt-${attempt}.json"
    local log="$LOGS/${stage}-attempt-${attempt}.log"

    local attempt_instruction="$instruction"

    if [[ "$attempt" -gt 1 ]]; then
      attempt_instruction="${attempt_instruction}

==================================================
AUTONOMOUS REPAIR ATTEMPT ${attempt}/${max_attempts}
==================================================

The previous attempt did NOT satisfy this stage completely.

Read the previous structured stage result if available:

${result}

Inspect the CURRENT repository state.
Preserve all correct work from previous attempts.

Do NOT merely repeat the previous report.

Close every actionable remaining item that can be solved by engineering work.

Examples of FIXABLE engineering gaps that are NOT human blockers:

- missing integration tests;
- missing PostgreSQL test setup;
- missing Fastify API tests;
- missing Tenant A / Tenant B IDOR tests;
- missing browser E2E coverage;
- missing F5/session restore coverage;
- missing fixtures/factories;
- missing migration/bootstrap validation;
- missing frontend error-state tests;
- broken typecheck;
- broken build;
- missing indexes;
- incomplete backend routes;
- incomplete frontend/backend integration;
- security-review findings;
- code-review findings.

If test infrastructure does not yet exist, create the smallest production-appropriate
test infrastructure necessary to verify the requirement.

Do not classify a fixable engineering gap as an external blocker.

Before returning PARTIAL again, perform another:

IMPLEMENT
-> TEST
-> QA REVIEW
-> SECURITY REVIEW
-> CODE REVIEW

cycle inside this attempt.

Only return BLOCKED/continue_pipeline=false when safe progress genuinely requires:

- unavailable external credentials;
- unavailable third-party API;
- destructive production operation;
- production deployment;
- irreducibly ambiguous product decision;
- infrastructure impossible to provide inside the current development environment.

Do not commit.
Do not push.
Do not deploy.
"
    fi

    echo
    echo "======================================================"
    echo " START $stage — attempt $attempt/$max_attempts"
    echo "======================================================"

    set +e

    codex \
      -c 'approval_policy="never"' \
      -c 'sandbox_workspace_write.network_access=true' \
      -c 'mcp_servers.ruflo.required=true' \
      -c 'mcp_servers.ruflo.startup_timeout_sec=60' \
      -c 'mcp_servers.ruflo.tool_timeout_sec=180' \
      -c 'mcp_servers.ruflo.default_tools_approval_mode="approve"' \
      exec \
      --sandbox workspace-write \
      --output-schema "$SCHEMA" \
      -o "$attempt_result" \
      "$attempt_instruction" \
      < "$MASTER" \
      2>&1 | tee "$log"

    local rc=${PIPESTATUS[0]}

    set -e

    git status --short \
      > "$CHECKPOINTS/${stage}-attempt-${attempt}-status.txt" || true

    git diff --binary \
      > "$CHECKPOINTS/${stage}-attempt-${attempt}.patch" || true

    git diff --stat \
      > "$CHECKPOINTS/${stage}-attempt-${attempt}-stat.txt" || true

    if [[ "$rc" -ne 0 ]]; then
      echo
      echo "⚠️ $stage attempt $attempt Codex exit code: $rc"

      if [[ "$attempt" -lt "$max_attempts" ]]; then
        echo "Retrying stage automatically..."
        attempt=$((attempt + 1))
        continue
      fi

      echo "❌ $stage failed after $max_attempts attempts."
      echo "Last log:"
      echo "$log"
      exit "$rc"
    fi

    if [[ ! -s "$attempt_result" ]]; then
      echo "⚠️ $stage attempt $attempt produced no structured result."

      if [[ "$attempt" -lt "$max_attempts" ]]; then
        attempt=$((attempt + 1))
        continue
      fi

      echo "❌ No structured result after $max_attempts attempts."
      exit 20
    fi

    cp "$attempt_result" "$result"

    echo
    jq . "$result"

    local status
    local continue_pipeline
    local external_blocker

    status="$(jq -r '.status' "$result")"
    continue_pipeline="$(jq -r '.continue_pipeline' "$result")"
    external_blocker="$(jq -r '.external_blocker' "$result")"

    echo
    echo "$stage status: $status"
    echo "$stage continue_pipeline: $continue_pipeline"
    echo "$stage external_blocker: $external_blocker"

    # Ideal outcome: stage fully completed.
    if [[ "$status" == "DONE" ]]; then
      touch "$finished"

      echo
      echo "✅ $stage completed successfully."
      return 0
    fi

    # A genuine external dependency may leave the stage PARTIAL/BLOCKED,
    # while allowing independent later work to continue.
    if [[ "$external_blocker" == "true" ]]; then
      if [[ "$continue_pipeline" == "true" ]]; then
        touch "$finished"

        echo
        echo "⚠️ $stage has an external blocker, but independent pipeline work can continue."
        return 0
      fi

      echo
      echo "🛑 $stage requires user/external intervention."
      jq -r '.summary' "$result"
      exit 30
    fi

    # No external blocker means PARTIAL is an engineering task,
    # not a reason to ask the user.
    if [[ "$attempt" -lt "$max_attempts" ]]; then
      echo
      echo "🔧 $stage is $status without an external blocker."
      echo "Launching autonomous repair attempt..."
      echo
      echo "Remaining:"
      jq -r '.remaining[]?' "$result" | sed 's/^/  - /'

      attempt=$((attempt + 1))
      continue
    fi

    echo
    echo "🛑 $stage is still $status after $max_attempts autonomous repair attempts."
    echo
    echo "Summary:"
    jq -r '.summary' "$result"

    echo
    echo "Remaining:"
    jq -r '.remaining[]?' "$result" | sed 's/^/  - /'

    echo
    echo "Stopping instead of weakening the quality gate."
    exit 31
  done
}

run_stage "DISCOVERY" "
The content on stdin is the authoritative Business Shield P0-P12 master specification.

Perform the PRE-IMPLEMENTATION DISCOVERY phase only.

Do not implement a product milestone yet.

Required actions:

1. Read AGENTS.md.
2. Use Ruflo MCP.
3. Initialize or reuse a hierarchical Ruflo swarm for coordination and shared memory.
4. Ruflo is coordination/memory only.
5. Use native project-scoped Codex subagents for actual analysis and implementation.
6. DO NOT call Ruflo agent_execute or require an Anthropic API key.
7. Inspect the entire current repository.
8. Inspect git status/diff.
9. Inspect package manifests and TypeScript configuration.
10. Inspect Prisma schema and all migrations.
11. Inspect backend routes/services/plugins.
12. Inspect frontend routes/pages/features/services.
13. Find mock/demo/localStorage production fallbacks.
14. Find TODO/FIXME/HACK.
15. Inspect tests and CI.
16. Build the implementation matrix P0-P12:
    existing / incomplete / missing / broken.
17. Build the dependency graph.
18. Store durable architecture baseline conclusions in Ruflo memory.

Apply:
DISCOVER -> VERIFY -> REUSE -> REPAIR -> EXTEND.

Do not rewrite working systems.

Your FINAL RESPONSE must conform to the supplied JSON schema.

Set:
stage = DISCOVERY

Set continue_pipeline=false only if continuing would be unsafe.
"

for number in $(seq 0 12); do
  stage="P${number}"

  run_stage "$stage" "
The content on stdin is the authoritative Business Shield P0-P12 master specification.

Execute ONLY milestone ${stage} from that specification.

This is autonomous production implementation.

Before editing:

1. Read AGENTS.md.
2. Retrieve relevant Ruflo memory.
3. Inspect the CURRENT repository state produced by all earlier completed stages.
4. Discover what parts of ${stage} are already implemented.
5. Verify existing behavior.
6. Reuse working code.
7. Repair incomplete/broken implementation.
8. Extend only what remains necessary.

Use the appropriate project-scoped agents.

product_architect:
- plans bounded implementation;
- protects architecture;
- determines ADR needs.

data_engineer:
- owns Prisma/schema/migrations when needed.

backend_engineer:
- owns core backend implementation.

integration_engineer:
- owns provider/integration concerns when relevant.

frontend_engineer:
- connects UI to real backend and repairs product behavior.

devops_engineer:
- owns CI/observability/release infrastructure when relevant.

qa_engineer:
- runs quality gates and adds regression tests.

security_reviewer:
- independently reviews security-sensitive changes.

code_reviewer:
- reviews the completed stage.

ux_product_reviewer:
- review user-facing behavior when ${stage} changes UI.

Do not let write-heavy agents edit overlapping files simultaneously.

Follow the exact ${stage} Definition of Done and the global quality gates in the master specification.

For every stage:

- do real implementation;
- do not substitute production functionality with mocks;
- maintain Organization tenant isolation;
- maintain backend authorization;
- maintain provider truthfulness;
- run applicable typecheck/tests/build/migration checks;
- repair failures introduced by the stage;
- store reusable durable conclusions in Ruflo memory.

If an external credential/provider blocks one sub-feature:
- document it honestly;
- implement every independent part;
- set external_blocker=true;
- set status=PARTIAL if appropriate;
- set continue_pipeline=true only when later stages can safely proceed.

Do not commit.
Do not push.
Do not deploy.

Your FINAL RESPONSE must conform to the supplied JSON schema.

Set stage = ${stage}.
"

done

run_stage "UX_FUNCTIONAL" "
The content on stdin is the authoritative Business Shield master specification.

P0-P12 implementation passes are complete.

Perform a dedicated FULL FRONTEND FUNCTIONAL POLISH cycle.

Use:
- ux_product_reviewer
- frontend_engineer
- qa_engineer
- backend_engineer when a UI defect is actually caused by API/backend behavior
- code_reviewer

Inspect every reachable application route and major product surface.

Find and repair:

- broken navigation;
- dead buttons;
- controls that do nothing;
- stale demo behavior;
- fake success states;
- missing API feedback;
- loading problems;
- empty-state defects;
- error-state defects;
- unavailable/offline-state defects;
- permission-state defects;
- form validation problems;
- F5 state restoration problems;
- frontend/backend contract bugs;
- inconsistent interactions;
- obvious regressions.

Do not do a visual redesign yet.

First make the product behavior coherent and trustworthy.

Run relevant frontend tests/build and browser/E2E validation where practical.

Do not commit.
Do not push.
Do not deploy.

Set stage = UX_FUNCTIONAL.
Return the required structured JSON result.
"

run_stage "UX_VISUAL" "
The content on stdin is the authoritative Business Shield master specification.

Perform a dedicated PREMIUM SAAS VISUAL POLISH cycle.

Use ux_product_reviewer first.
Then use frontend_engineer for implementation.
Then qa_engineer and code_reviewer.

Audit and repair:

- typography hierarchy;
- font sizing;
- spacing rhythm;
- page density;
- cards;
- tables;
- forms;
- modal/dialog consistency;
- sidebar;
- navigation;
- buttons;
- badges;
- tabs;
- filters;
- empty states;
- skeletons;
- alerts;
- notifications;
- hover states;
- focus states;
- disabled states;
- animations/transitions;
- icon alignment;
- border/radius consistency;
- visual contrast;
- dark theme;
- light theme.

Preserve the Business Shield visual identity.

Target premium SaaS maturity comparable to Linear, Stripe, Notion and ClickUp,
without copying them.

Fix objectively weak/inconsistent UI.
Do not churn already-good UI merely to generate changes.

Do not commit.
Do not push.
Do not deploy.

Set stage = UX_VISUAL.
Return the required structured JSON result.
"

run_stage "UX_RESPONSIVE_A11Y" "
The content on stdin is the authoritative Business Shield master specification.

Perform the final dedicated responsive/accessibility frontend hardening pass.

Use:
- ux_product_reviewer
- frontend_engineer
- qa_engineer
- code_reviewer

Validate important screens at:

- 2560 / 2K
- 1920
- 1240
- 980
- 480

Repair:

- clipping;
- horizontal overflow;
- broken grids;
- unusable tables;
- mobile navigation;
- touch targets;
- modal sizing;
- form wrapping;
- typography scaling;
- sidebar collapse behavior;
- dark/light responsive defects.

Accessibility:

- keyboard navigation;
- focus visibility;
- semantic controls;
- form labels;
- ARIA where actually necessary;
- color contrast;
- reduced motion where appropriate;
- disabled-state clarity.

Use existing browser/E2E tooling where available.

If browser automation is absent, add only the smallest justified test tooling needed for reliable critical-flow validation.

Do not commit.
Do not push.
Do not deploy.

Set stage = UX_RESPONSIVE_A11Y.
Return the required structured JSON result.
"

no_defect_streak=0

for loop in $(seq 1 6); do
  stage="HARDENING_${loop}"

  run_stage "$stage" "
The content on stdin is the authoritative Business Shield master specification.

Perform autonomous hardening cycle ${loop}.

Audit the CURRENT complete product.

Use independent specialist investigation before editing.

Prioritize:

- security bugs;
- tenant leaks;
- IDOR;
- privilege escalation;
- auth/session edge cases;
- race conditions;
- transaction-boundary errors;
- migration problems;
- duplicate import/job behavior;
- N+1 queries;
- missing indexes;
- broken empty/error/loading states;
- stale frontend state/cache;
- API contract inconsistencies;
- strict TypeScript issues;
- integration truthfulness;
- secret exposure;
- bad logging;
- dead code;
- mock leakage;
- responsive/UI regressions;
- accessibility regressions;
- production build failures.

Workflow:

Audit
-> Prioritize
-> Repair
-> Test
-> Security review
-> Code review
-> Ruflo memory update.

Fix significant issues discovered during the cycle.

Do not commit.
Do not push.
Do not deploy.

Set stage = HARDENING_${loop}.

Set significant_defects_found=true if this cycle found a meaningful defect requiring code/config/schema changes.

Set significant_defects_found=false if no meaningful defects remain.

Return the required structured JSON result.
"

  defects="$(jq -r '.significant_defects_found' "$STATE/${stage}.json")"

  if [[ "$defects" == "false" ]]; then
    no_defect_streak=$((no_defect_streak + 1))
  else
    no_defect_streak=0
  fi

  if [[ "$no_defect_streak" -ge 2 ]]; then
    echo
    echo "✅ Two consecutive hardening cycles found no significant defects."
    break
  fi
done

run_stage "FINAL" "
The content on stdin is the authoritative Business Shield master specification.

Perform FINAL P0-P12 PRODUCT ACCEPTANCE.

Inspect the complete CURRENT repository after all autonomous stages.

Use:
- product_architect
- qa_engineer
- security_reviewer
- code_reviewer
- ux_product_reviewer
- devops_engineer
and other specialists if needed.

Run the broadest practical final validation.

Verify the master specification's final acceptance criteria.

For every P0-P12 assign exactly one:

DONE
PARTIAL
BLOCKED

Never mark DONE when key functionality remains mocked.

Also perform a final whole-product frontend review.

Create this repository file:

RUFLO_P0_P12_FINAL_REPORT.md

with exactly this high-level structure:

# Business Shield P0–P12 Final Report

## Executive Summary

## P0
Status:
Implemented:
Verified:
Remaining:

Continue through P12.

Then:

## Database migrations
## API endpoints
## Frontend changes
## Tests
## Security findings
## Performance findings
## External blockers
## Technical debt
## Production readiness
## Recommended next actions

Report only facts actually supported by repository state and executed validation.

Do not hide failing tests or blockers.

Do not commit.
Do not push.
Do not deploy.

Set stage = FINAL.
Return the required structured JSON result.
"

echo
echo "======================================================"
echo " AUTONOMOUS P0-P12 PIPELINE FINISHED"
echo "======================================================"
echo
echo "Final report:"
echo "$ROOT/RUFLO_P0_P12_FINAL_REPORT.md"
echo
echo "Stage results:"
echo "$STATE"
echo
echo "Logs:"
echo "$LOGS"
echo
echo "Current diff:"
git diff --stat || true
