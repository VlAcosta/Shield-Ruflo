Perform the formal architecture and product audit of Business Shield.

STRICT READ-ONLY PHASE.

DO NOT:
- modify files;
- create files;
- install packages;
- create migrations;
- commit;
- implement features.

Before doing anything:

1. Read AGENTS.md completely.
2. Read relevant documentation in:
   - docs/product/
   - docs/architecture/
   - docs/adr/
   - docs/quality/

3. Use Ruflo MCP memory before analysis.

Retrieve/search at minimum:

- bs-architecture/full-stack-production
- bs-architecture/working-backend-mandatory
- bs-architecture/multi-tenant-foundation
- bs-architecture/vertical-slice-policy
- bs-security/security-baseline
- bs-integrations/provider-truth
- bs-decisions/evolution-policy

Ruflo is the shared memory and coordination layer.
Native project-scoped Codex subagents are the actual analysis/execution agents.

Do NOT create duplicate Ruflo execution workers.

Use at most 6 Codex subagents concurrently.

PHASE 1 — PARALLEL INVESTIGATION

Spawn exactly:

- product_architect
- frontend_engineer
- backend_engineer
- data_engineer
- security_reviewer
- qa_engineer

All six agents are analysis-only during this phase.

product_architect:
- map product architecture;
- map domains;
- identify architectural debt;
- determine missing architecture decisions;
- propose safe target architecture.

frontend_engineer:
- inspect React/frontend architecture;
- routing;
- layouts;
- state;
- persistence;
- services;
- API assumptions;
- mocks;
- dark/light theme;
- responsive architecture;
- accessibility.

backend_engineer:
- determine exactly what backend exists;
- inspect APIs;
- auth;
- RBAC;
- integrations;
- background jobs;
- notifications;
- realtime;
- billing;
- AI;
- identify missing production backend functionality.

data_engineer:
- inspect persistence;
- schemas;
- database;
- migrations;
- organization ownership;
- tenant isolation;
- data integrity;
- indexes and constraints.

security_reviewer:
- inspect authentication;
- authorization;
- RBAC;
- IDOR;
- tenant isolation;
- secret handling;
- integrations;
- admin;
- billing;
- unsafe client trust.

qa_engineer:
- inspect tests;
- build;
- typecheck/lint;
- API tests;
- integration tests;
- browser/e2e tests;
- regression protection;
- untested areas.

Wait for ALL six agents.

PHASE 2 — CAPABILITY CLASSIFICATION

Classify each capability using one or more:

- production implementation
- partially implemented
- frontend-only
- mock
- placeholder
- duplicate/obsolete
- missing

Inspect at minimum:

- Dashboard
- Reviews
- Review responses
- Review sources
- Integrations
- Analytics
- Competitors
- QR campaigns
- Tasks
- Automations
- Notifications
- Reports
- Authentication
- RBAC
- Organizations
- Team
- Profile
- Settings
- Admin
- Billing
- AI
- Backend
- Database
- API
- Workers/queues
- Realtime
- Tests
- Security
- Observability
- CI/CD

Explicitly identify every place where UI functionality exists without the production backend required to make it real.

PHASE 3 — TARGET ARCHITECTURE

Design the smallest safe production-grade full-stack architecture.

Business Shield must support:

- real backend APIs;
- production persistence;
- database migrations;
- authentication;
- backend RBAC;
- Organization tenant isolation;
- Reviews as a core domain;
- provider integrations;
- background jobs;
- notifications;
- realtime where justified;
- billing;
- AI integrations;
- observability;
- automated tests;
- CI/CD;
- safe deployment.

Do NOT choose technologies merely because they are popular.

Compare reasonable alternatives based on:
- existing repository;
- migration cost;
- maintainability;
- security;
- scalability;
- developer experience;
- operational complexity.

Require ADRs for significant decisions.

PHASE 4 — INDEPENDENT REVIEW

After the first six agents have finished, spawn:

- code_reviewer

Give code_reviewer the consolidated findings.

Ask it to challenge:

- unsupported conclusions;
- overlooked existing functionality;
- unnecessary rewrites;
- missing backend requirements;
- missing tenant isolation;
- missing authorization;
- security gaps;
- test gaps;
- unjustified technology choices;
- migration risks.

Wait for code_reviewer.

PHASE 5 — FINAL REPORT

Return:

1. Executive summary
2. Repository map
3. Product/domain map
4. Frontend assessment
5. Backend assessment
6. Database/data assessment
7. Auth/RBAC/multi-tenancy assessment
8. Integration assessment
9. Capability matrix
10. Security risks
11. Testing gaps
12. Technical debt
13. Duplicate/obsolete code
14. Frontend-only/mock functionality
15. Missing backend functionality
16. Target full-stack architecture
17. Technology alternatives
18. Required ADRs
19. Incremental migration strategy
20. P0 roadmap
21. P1 roadmap
22. P2 roadmap
23. P3 roadmap
24. Exact recommended first implementation milestone

For important conclusions cite concrete repository files, symbols, routes, services, schemas or tests.

DO NOT IMPLEMENT ANYTHING.

Stop after the report and wait for user approval.
