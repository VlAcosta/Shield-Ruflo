# Business Shield — Agent Engineering Constitution

## 1. Mission

Business Shield is a commercial production-grade Reputation Operations SaaS.

The goal is not to build a prototype or visual demo.
The goal is to progressively evolve the existing project into a reliable,
secure, scalable and commercially usable SaaS product.

The system may include and modify:

- frontend;
- backend;
- database;
- API;
- authentication;
- authorization and RBAC;
- multi-tenancy;
- integrations;
- background workers;
- queues;
- realtime functionality;
- analytics;
- billing;
- AI functionality;
- observability;
- infrastructure;
- CI/CD;
- automated tests.

Frontend-only limitations do NOT apply.

---

## 2. Product principle

Business Shield helps companies manage reputation and customer feedback.

Reviews and reputation management are core product domains.

The product should progressively support:

- review aggregation;
- review monitoring;
- review responses;
- reputation analytics;
- competitor monitoring;
- QR-based review acquisition;
- reports;
- notifications;
- tasks and workflows;
- integrations;
- organization/team management;
- role-based permissions;
- billing/subscriptions;
- AI-assisted operations.

Do not implement meaningless demo functionality merely to make UI controls appear functional.

---

## 3. Existing product must evolve, not be blindly rewritten

Before changing architecture:

1. inspect the existing implementation;
2. identify what already works;
3. identify mocks and temporary implementations;
4. identify duplicate/obsolete code;
5. determine dependencies and regressions;
6. propose the smallest safe migration path.

Preserve working functionality whenever practical.

Large rewrites require an explicit architectural justification.

---

## 4. Multi-tenancy

Business Shield is a multi-tenant SaaS.

Organization is the primary tenant.

Business-owned entities must be organization-scoped.

Examples:

- reviews;
- locations;
- integrations;
- competitors;
- tasks;
- reports;
- notifications;
- subscriptions;
- analytics;
- members;
- settings.

Never allow cross-organization data leakage.

Tenant isolation must be enforced server-side.

---

## 5. Authentication and authorization

Frontend permission checks are UX only.

Authorization must always be enforced by the backend.

Never rely solely on:

- hidden buttons;
- disabled UI;
- client-side roles;
- localStorage permissions.

Use explicit server-side permission checks.

Apply least privilege.

---

## 6. External provider truthfulness

Never fake external success.

The UI must NOT claim:

- Connected
- Synced
- Published
- Paid
- Authorized
- Sent
- Imported
- Updated

unless the corresponding backend/provider operation actually succeeded.

Mocks must be clearly identifiable as mocks or development fixtures.

---

## 7. Security

Never commit:

- passwords;
- API keys;
- access tokens;
- refresh tokens;
- private keys;
- .env files containing secrets;
- Codex credentials;
- provider credentials.

Validate untrusted input.

Enforce authorization server-side.

Prevent tenant data leakage.

Treat integrations, billing, authentication and admin functionality as security-sensitive.

---

## 8. Database

All production database changes require migrations.

Do not make destructive schema changes silently.

Before destructive or irreversible migrations:

1. explain the impact;
2. propose migration/backfill strategy;
3. protect existing data;
4. document rollback strategy.

---

## 9. Architecture decisions

Significant architectural decisions must be recorded in:

docs/adr/

Create an ADR when choosing or materially changing:

- backend framework;
- database;
- ORM;
- authentication architecture;
- RBAC model;
- multi-tenancy strategy;
- queues;
- realtime architecture;
- billing provider;
- external integration architecture;
- AI provider architecture;
- observability architecture.

Do not silently introduce major infrastructure.

---

## 10. UI / UX requirements

Business Shield should feel like a premium modern SaaS product.

Target quality is comparable to products such as:

- Stripe;
- Linear;
- Notion;
- ClickUp.

Do not blindly copy those products.

Maintain a coherent Business Shield design language.

Every important screen should consider:

- loading state;
- empty state;
- error state;
- unavailable/offline state;
- success state where appropriate;
- light theme;
- dark theme;
- keyboard accessibility;
- responsive layout.

Important viewport classes:

- 2560 / 2K;
- 1920;
- 1240;
- 980;
- 480.

Normal users should not need browser zoom to comfortably read the application.

---

## 11. Engineering workflow

Before every significant task:

1. Read this AGENTS.md.
2. Search Ruflo memory for relevant decisions and prior work.
3. Inspect relevant existing code.
4. Inspect relevant tests.
5. Determine affected domains.
6. Determine data/security implications.
7. Plan before editing.

Do not start by rewriting files blindly.

---

## 12. Agent delegation

For complex work, delegate independent investigation to specialized agents.

Prefer parallel agents for:

- repository exploration;
- architecture analysis;
- security review;
- test analysis;
- dependency research;
- regression analysis.

Avoid multiple agents simultaneously editing overlapping files.

A single implementation owner should normally perform related code changes.

---

## 13. Definition of Done

A task is NOT complete merely because the application builds.

Depending on the affected area, validate:

- lint;
- type checking;
- unit tests;
- integration tests;
- API tests;
- browser/e2e tests;
- production build;
- authorization behavior;
- tenant isolation;
- error states;
- responsive layout;
- dark/light themes;
- regressions.

Report what was actually tested.

Never claim tests passed if they were not executed.

---

## 14. Code quality

Prefer:

- small cohesive modules;
- explicit naming;
- reusable domain services;
- centralized contracts;
- typed boundaries where possible;
- predictable state management;
- documented APIs;
- incremental refactoring.

Avoid:

- giant components;
- duplicated business logic;
- hidden side effects;
- unexplained magic values;
- mock data leaking into production logic;
- premature abstractions.

---

## 15. Product integrity

Maximum product quality does NOT mean maximum code volume.

Do not add technology only because it is fashionable.

Every dependency, service and abstraction must solve a real product or engineering problem.

---

## 16. Completion report

After significant work, report:

1. what was analyzed;
2. what was changed;
3. affected files;
4. architecture decisions;
5. migrations if any;
6. tests performed;
7. remaining risks;
8. recommended next step.

Store reusable conclusions and successful patterns in Ruflo memory.

## 17. Mandatory Production Backend Delivery

Business Shield is NOT a frontend-only project.

Agents are explicitly authorized and expected to create and modify a real production backend whenever product functionality requires it.

A feature is NOT complete when only its frontend, mock data, localStorage behavior, static JSON, placeholder API, fake service, or UI state exists.

For features that require persistence, security, external integrations, automation, billing, analytics, background work, or server-side business logic, completion normally requires a real vertical slice including the relevant:

- backend route/API;
- controller/handler;
- domain/application service;
- database model/schema;
- migration;
- organization/tenant scoping;
- authentication;
- server-side authorization/RBAC;
- request validation;
- error handling;
- persistence;
- external provider adapter when applicable;
- idempotency where applicable;
- logging/observability where appropriate;
- automated tests;
- frontend integration with the real API.

Frontend-only implementation is allowed only when the task explicitly requests frontend-only work.

Do not mark a product feature complete if the backend required for real use is still missing.

Do not replace backend requirements with:
- TODO comments;
- mock promises;
- hardcoded successful responses;
- fake API delays;
- localStorage as production persistence;
- static fixtures presented as live data;
- frontend-only permission checks.

When a feature needs backend work, the implementation team must build it.

### Vertical Slice Principle

Prefer delivering functionality end-to-end:

User action
→ frontend
→ API
→ authorization
→ domain logic
→ database/provider
→ real result
→ frontend state
→ automated validation

Do not build disconnected layers without a clear integration path.

### Backend Foundation

If the repository currently has no adequate backend, the team must:

1. inspect current architecture;
2. have product_architect propose the smallest suitable production architecture;
3. record major choices in ADRs;
4. establish the backend foundation;
5. establish database migrations;
6. establish authentication and tenant boundaries;
7. connect frontend services to real APIs;
8. add automated backend/API tests.

Do not preserve a frontend-only architecture merely because that is the current state.

### External Integrations

If provider credentials are unavailable during development:

- implement the real provider abstraction and backend flow as far as possible;
- provide explicit configuration requirements;
- provide honest unavailable/not-configured states;
- add test adapters or fixtures when useful.

Never simulate a successful external provider operation and present it as real.

### Definition of Done for Backend-Dependent Features

A backend-dependent feature is complete only when the relevant production path works end-to-end and its critical behavior is validated.

At minimum consider:

- API behavior;
- persistence;
- authentication;
- authorization;
- organization isolation;
- validation;
- failure handling;
- migrations;
- relevant automated tests;
- frontend/backend contract compatibility.

"Frontend works" is not equivalent to "feature is complete".
