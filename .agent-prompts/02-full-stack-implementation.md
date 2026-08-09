This is an APPROVED FULL-STACK IMPLEMENTATION task for Business Shield.

Read AGENTS.md first.

Use Ruflo MCP memory before starting.

Retrieve/search:
- architecture decisions;
- security decisions;
- previous successful implementation patterns;
- regressions;
- integration rules.

Business Shield requires a REAL production backend.

DO NOT substitute:
- mocks;
- fake API delays;
- localStorage production persistence;
- static JSON presented as live data;
- TODO endpoints;
- frontend-only RBAC;
- hardcoded provider success;
- fake Connected/Synced/Published/Paid/Authorized states.

Prefer a complete vertical slice:

frontend
→ API contract
→ authentication
→ backend authorization
→ organization scoping
→ domain logic
→ database/provider
→ real result
→ frontend state
→ automated validation

WORKFLOW

PHASE 1 — PLAN

Spawn product_architect.

Have it:
- inspect current implementation;
- identify affected domains;
- identify relevant ADRs;
- define the smallest safe vertical slice;
- define migration and regression risks.

Do not let product_architect implement application code.

PHASE 2 — DATA

If persistence changes are required, spawn data_engineer.

data_engineer owns:
- schema;
- migrations;
- relationships;
- constraints;
- indexes;
- organization ownership;
- safe backfills.

Finish its bounded data work before overlapping backend files are edited.

PHASE 3 — BACKEND

Spawn backend_engineer as PRIMARY backend implementation owner.

backend_engineer must implement the real required backend, including where applicable:

- API routes;
- handlers/controllers;
- domain/application services;
- validation;
- authentication;
- backend RBAC;
- tenant isolation;
- persistence;
- integrations;
- webhooks;
- workers/queues;
- notifications;
- realtime;
- billing;
- AI boundaries;
- error handling;
- observability;
- backend/API tests.

Do not stop at planning or pseudocode.

PHASE 4 — FRONTEND

After API contracts are stable, spawn frontend_engineer.

frontend_engineer must:
- connect UI to the real backend;
- remove obsolete production mocks;
- implement loading/empty/error/unavailable states;
- preserve light/dark theme;
- preserve responsiveness;
- preserve accessibility;
- avoid fake provider success.

PHASE 5 — QA

Spawn qa_engineer.

Validate where applicable:

- lint;
- typecheck;
- unit tests;
- integration tests;
- API tests;
- database migrations;
- authentication;
- authorization;
- tenant isolation;
- production build;
- browser/e2e flows;
- responsive UI;
- light/dark theme.

Never claim a test passed unless it actually ran.

PHASE 6 — SECURITY

Spawn security_reviewer.

Review:
- authentication;
- backend authorization;
- IDOR;
- organization isolation;
- validation;
- secret exposure;
- provider credentials;
- billing;
- admin access;
- unsafe logging.

PHASE 7 — FINAL REVIEW

Spawn code_reviewer.

Review the complete diff for:
- correctness;
- regressions;
- architecture drift;
- missing backend functionality;
- missing tests;
- tenant leakage;
- fake success states;
- duplicated logic;
- unnecessary complexity.

If material findings exist:
return them to the appropriate implementation owner,
fix them,
then re-run relevant validation.

IMPORTANT:
Do not allow multiple write-heavy agents to edit overlapping files simultaneously.

PHASE 8 — MEMORY

After successful completion, use Ruflo MCP memory_store to record:

- architecture decisions;
- successful implementation patterns;
- important gotchas;
- regression discoveries;
- provider-specific lessons.

FINAL RESPONSE

Report:

1. what was analyzed;
2. what was implemented;
3. backend changes;
4. database/migrations;
5. frontend changes;
6. security changes;
7. affected files;
8. tests actually executed;
9. test results;
10. remaining risks;
11. Ruflo memory entries stored;
12. recommended next milestone.

Do not declare completion while required backend functionality remains mocked.
