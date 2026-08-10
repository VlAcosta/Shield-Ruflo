# Business Shield Autonomous Product Hardening Run

You are running an APPROVED AUTONOMOUS FULL-STACK PRODUCT IMPROVEMENT SESSION.

The user explicitly authorizes the agent team to improve Business Shield without waiting for approval between ordinary implementation milestones, subject to the safety and architecture boundaries below.

The goal is to evolve the existing Business Shield repository as far as safely possible toward a production-grade commercial Reputation Operations SaaS.

This is NOT frontend-only work.

You are expected to implement real:
- frontend;
- backend;
- database;
- APIs;
- authentication;
- RBAC;
- multi-tenancy;
- integrations where credentials are not required;
- workers where justified;
- analytics foundations;
- tests;
- observability foundations;
- CI/CD improvements;
- security hardening.

==================================================
ABSOLUTE RULES
==================================================

Read AGENTS.md completely before doing anything.

Use Ruflo MCP memory before every implementation cycle.

Ruflo memory is REQUIRED.

If Ruflo MCP is unavailable:
STOP immediately.

Never continue silently without Ruflo.

Preserve the approved architectural direction unless repository evidence proves it impossible:

- React frontend
- Fastify + TypeScript backend
- Prisma
- PostgreSQL
- modular monolith
- versioned REST API

Prefer incremental evolution.

Do not perform a broad rewrite.

Do not introduce major infrastructure solely because it is fashionable.

Do NOT introduce without a demonstrated requirement:

- NestJS
- microservices
- Kafka
- Redis
- BullMQ
- WebSockets
- data warehouse
- Kubernetes
- a new frontend framework

==================================================
SAFETY BOUNDARY
==================================================

You MAY autonomously:

- edit workspace source files;
- create safe migrations;
- add tests;
- add documentation and ADRs;
- refactor within approved architecture;
- install reasonable development dependencies when required;
- run tests/builds/lint/typecheck;
- improve frontend/backend contracts;
- improve RBAC and tenant isolation;
- replace mocks with real local production code;
- improve accessibility/responsiveness;
- improve logging and error handling;
- improve CI configuration;
- store non-secret findings in Ruflo memory.

You MUST NOT autonomously:

- deploy to production;
- delete production data;
- perform destructive production migrations;
- access or expose secrets;
- rotate credentials;
- purchase services;
- enable paid external providers;
- publish external review replies;
- make billing transactions;
- weaken authentication/security;
- push to main;
- merge branches;
- force-push;
- delete repositories;
- fabricate provider success.

Do NOT commit or push unless explicitly authorized in a later user request.

==================================================
EXTERNAL PROVIDER TRUTH
==================================================

Never fake:

- Connected
- Synced
- Published
- Sent
- Paid
- Authorized
- Imported

If provider credentials or a provider API are unavailable:

- implement the correct backend abstraction;
- implement configuration/error states;
- implement test adapters where useful;
- expose an honest unavailable/not-configured state;
- continue with work that does not require real provider credentials.

==================================================
MULTI-TENANCY
==================================================

Organization is the primary tenant.

Every business-owned entity must be tenant-safe.

Backend authorization is mandatory.

Frontend RBAC is UX only.

Every ID-addressable tenant resource must resist Tenant A -> Tenant B ID manipulation.

==================================================
AUTONOMOUS WORKFLOW
==================================================

Run a maximum of SIX major implementation cycles.

Do not attempt infinite work.

Before Cycle 1:

1. Read AGENTS.md.
2. Read existing product/architecture/ADR documentation.
3. Retrieve/search relevant Ruflo memories.
4. Inspect git diff and current branch.
5. Inspect the latest architecture audit conclusions if available.
6. Inspect existing tests/build state.

For EACH cycle:

==================================================
A. SELECT NEXT MILESTONE
==================================================

Spawn product_architect.

Assess the current repository AFTER all previous cycles.

Select exactly ONE highest-value self-contained milestone.

Priority order:

P0:
- migration correctness;
- authentication/session authority;
- Organization tenant isolation;
- backend RBAC;
- IDOR prevention;
- real Reviews backend;
- truthful review reply state;
- API/error contracts;
- critical security issues;
- broken builds/tests caused by current work.

P1:
- review provider architecture;
- integration truthfulness;
- jobs/outbox foundations;
- notifications/tasks;
- audit logging;
- CI/CD;
- operational health;
- remaining major mock removal.

P2:
- analytics;
- competitors;
- QR campaigns;
- reports;
- automation;
- billing foundation;
- AI integration foundation.

P3:
- performance refinement;
- realtime where justified;
- premium UX refinement;
- accessibility;
- responsive refinement;
- maintainability/refactoring;
- production hardening.

Prefer foundational correctness over adding more visible features.

Create/update ADRs only when necessary.

==================================================
B. DATA
==================================================

If the milestone changes persistence:

spawn data_engineer.

It owns:
- Prisma schema;
- migrations;
- constraints;
- indexes;
- tenant relationships;
- safe data evolution.

Only one agent may own overlapping schema/migration files at a time.

==================================================
C. BACKEND
==================================================

Spawn backend_engineer as primary backend implementation owner when backend functionality is involved.

Implement the real production path.

Do not stop at:
- interfaces;
- TODOs;
- mocks;
- pseudocode.

Implement:
- routes;
- handlers;
- services;
- validation;
- authorization;
- tenant checks;
- persistence;
- error handling;
- tests

as required by the selected milestone.

==================================================
D. FRONTEND
==================================================

After backend/API contracts are stable:

spawn frontend_engineer.

Integrate with the REAL backend.

Maintain:

- Business Shield design language;
- light theme;
- dark theme;
- responsive layouts;
- accessibility;
- loading states;
- empty states;
- error states;
- unavailable states.

Do not redesign unrelated pages during a backend milestone.

==================================================
E. QA
==================================================

Spawn qa_engineer.

Run relevant:

- lint;
- typecheck;
- unit tests;
- integration tests;
- API tests;
- migration/bootstrap tests;
- browser/e2e tests;
- production build.

Add missing regression tests for changed behavior.

Never claim tests passed unless actually executed.

If this cycle introduced a failure:
fix it before continuing.

==================================================
F. SECURITY
==================================================

Spawn security_reviewer.

For security-sensitive work review:

- authentication;
- session handling;
- RBAC;
- IDOR;
- tenant isolation;
- validation;
- secrets;
- integrations;
- billing;
- unsafe logging;
- privilege escalation.

Fix Critical and High findings before moving to the next cycle.

==================================================
G. CODE REVIEW
==================================================

Spawn code_reviewer.

Review the complete cycle diff for:

- correctness;
- regressions;
- architecture drift;
- missing backend pieces;
- fake success states;
- tenant leakage;
- duplicated logic;
- unnecessary complexity;
- missing tests.

Return material findings to the appropriate implementation owner.

Fix them.

Re-run affected gates.

==================================================
H. MEMORY
==================================================

After the cycle is stable, store reusable conclusions in Ruflo memory.

Store only durable knowledge:

- architecture decisions;
- migration patterns;
- tenant patterns;
- integration patterns;
- security lessons;
- regression discoveries;
- successful implementation patterns.

Never store secrets.

==================================================
I. CONTINUE OR STOP
==================================================

After each cycle, re-evaluate the repository.

Continue automatically if another high-value self-contained milestone exists.

STOP early if:

1. remaining work requires external credentials;
2. remaining work requires a paid provider/service;
3. a destructive migration requires human product/data approval;
4. a major architecture replacement is required;
5. a product requirement is materially ambiguous;
6. production deployment is the next step;
7. no meaningful P0/P1/P2/P3 self-contained milestone remains;
8. six major cycles have completed;
9. available context/resources are insufficient to safely continue.

==================================================
QUALITY TARGET
==================================================

Do not interpret "improve the product" as "write maximum code".

Optimize for:

- correctness;
- real functionality;
- security;
- multi-tenant safety;
- reliability;
- commercial usability;
- UX quality;
- maintainability;
- tests;
- observability;
- incremental architecture.

Maximum quality is more important than maximum feature count.

==================================================
FINAL VALIDATION
==================================================

After the final cycle:

run the broadest practical validation suite.

At minimum attempt, where available:

- frontend lint;
- backend lint;
- typecheck;
- unit tests;
- integration/API tests;
- migration-from-empty;
- production frontend build;
- production backend build;
- security regression tests.

Run git diff --check.

Do not commit.
Do not push.

==================================================
FINAL REPORT
==================================================

Return:

1. overall autonomous-run status;
2. cycles completed;
3. milestone completed in each cycle;
4. architecture decisions;
5. ADRs created/updated;
6. database/migrations;
7. backend improvements;
8. frontend improvements;
9. security improvements;
10. test improvements;
11. CI/observability improvements;
12. mocks/placeholders removed;
13. affected files;
14. all commands/tests actually executed;
15. passing validation;
16. failing validation;
17. remaining P0 issues;
18. remaining P1 issues;
19. remaining P2/P3 opportunities;
20. blockers requiring the user;
21. Ruflo memories stored;
22. exact recommended next action.

DO NOT COMMIT.
DO NOT PUSH.

Stop after the final report.
