# Business Shield — Strategic P0 / GA Execution Ledger

Date: 2026-08-12
Source of truth: Strategic Product & Technical Audit + current production/P26 lineage.

## Purpose

This document is the handoff contract for subsequent implementation agents. It records what is materially implemented, what is deliberately not claimed, and which release gates remain mandatory. UI presence alone never qualifies an item as complete.

## Completed agent workstreams

### 1. Commercial Platform Agent

Status: independently green before integration.

Implemented:
- public plans: START 3,490 RUB, GROWTH 8,990 RUB, PRO 18,990 RUB, BUSINESS from 39,900 RUB;
- legacy FREE retained as grandfathered fallback and excluded from public catalog;
- server materialized plan entitlements;
- annual discount metadata (15%);
- real usage snapshot for locations, review sources, monthly reviews, active users, AI actions, enabled automations and active competitors;
- usage states at 70/90/100 percent;
- pricing page derives commercial price/quota truth from backend catalog;
- software add-ons separated from managed human services;
- fake local demo checkout and hardcoded promo success removed.

Invariant: frontend pricing copy may describe outcomes, but price/limits are backend truth.

### 2. Provider Truth Agent

Status: independently green before integration.

Implemented:
- public credential-free provider truth endpoint;
- capabilities derived from registered runtime adapters rather than frontend constants;
- Google Business Profile truth: OAuth, account/location/profile reads, review ingest/read and reply where the production adapter implements them;
- current sync truth explicitly reports queued on-demand job behavior; no periodic SLA is claimed;
- review delete remains unavailable because the adapter contract does not implement it;
- Yandex, 2GIS, Ozon, Otzovik and Wildberries remain PLANNED with zero operational read/reply/sync capability until production adapters + contract tests exist;
- frontend provider capability resolution fails closed until server truth is loaded.

Invariant: no marketing/UI surface may advertise an operational provider capability that the backend adapter registry cannot prove.

### 3. Positioning & Marketing Truth Agent

Status: independently green before integration.

Implemented:
- reputation workflow positioning: Detect → Prioritize → Assist → Govern → Escalate → Operate → Measure;
- core product narrative narrowed to Unified Reviews Inbox, SLA/Triage, AI Reply Intelligence, Approval/Governance, Closed-loop Tasks, Root-cause Analytics and Executive Reports;
- unsupported vanity claims removed from the active landing surface;
- product-truth section added: backend-enforced access, capability-aware integrations, auditable workflow and usage-based packaging;
- ICP focus narrowed to local business, multi-location networks and marketplace/e-commerce as the second wedge;
- public proof reframed around measurable product KPIs rather than unsupported business outcome statistics;
- landing package summary aligned to START/GROWTH/PRO/BUSINESS.

Invariant: claims require a reproducible source/methodology or remain absent from public marketing.

### 4. Entitlement Enforcement Agent

Status: independently green before integration.

Implemented:
- PostgreSQL race-safe hard-cap enforcement for locations, active review sources, active users, enabled automation rules and active competitors;
- transaction-scoped advisory locks prevent concurrent requests from consuming the same final quota slot;
- START/GROWTH/PRO/BUSINESS are hard-enforced;
- legacy FREE remains grandfathered and is intentionally not newly hard-capped;
- monthly review/AI meters intentionally remain warning/grace based so critical reputation incident workflows are not disabled mid-event;
- application prechecks provide fast product errors, while DB triggers remain the authoritative concurrency backstop;
- database PLAN_LIMIT_REACHED is mapped to stable HTTP 409 with upgrade metadata;
- integration tests cover HTTP and database enforcement paths.

Invariant: quota enforcement must survive direct Prisma/database writes and concurrent requests, not only UI checks.

### 5. Billing Boundary Agent

Status: independently green and integrated.

Implemented:
- durable sales-assisted purchase request instead of fake checkout success when no self-serve acquiring provider is configured;
- server-calculated amount/annual discount and plan selection;
- mandatory idempotency key and durable request history;
- response explicitly states `paymentCreated=false` and `subscriptionActivated=false`;
- no subscription state changes merely because a purchase request was recorded;
- multi-file Prisma schema adopted for new commercial domains;
- pricing frontend continues the recorded request without representing it as a payment redirect.

Invariant: recording a commercial request is not payment success and never activates a subscription.

Not claimed: self-serve acquiring, provider checkout session, payment webhook validation, reconciliation, refund processing or automatic subscription activation.

### 6. Premium Entitlement Agent

Status: independently green and integrated; combined integration gate green at `282dcd88c5e2f2d1832a9908c1ed5b59f1afdec7` before GA merge.

Implemented:
- backend capability gates are additional to RBAC rather than UI visibility checks;
- Competitive Intelligence requires GROWTH+;
- AI Visibility requires PRO+;
- agency portfolio management/client invitation management requires BUSINESS;
- client consent/revocation safety operations are not commercially blocked by the client's own lower plan;
- AI Visibility route/service contract uses the canonical `aiVisibility` entitlement key;
- P22/P26 regression fixtures use real active Plan/Subscription records so tenant isolation is tested behind the entitlement boundary.

Invariant: effective access is role permission ∩ commercial entitlement; client safety operations cannot be held hostage by the agency's commercial state.

### 7. GA Readiness Agent

PR: #33
Merged integration commit: `35d576e3566286aa5afa0290de5bd8226f740890`
Status: **full agent quality gate green and merged into integration**.

Implemented and proven:
- migration #22 with PostgreSQL-backed per-user and per-tenant expensive-AI request buckets;
- transactional limiter for Ask Shield query, AI Reply generation, Review Intelligence re-analysis and AI Visibility runs;
- route-contract regression that locks the exact expensive POST paths and excludes ordinary/read-only traffic;
- `429 AI_RATE_LIMITED` with `Retry-After`, while rejected limiter transactions roll back tentative increments;
- private `/internal/metrics` exporter protected by a dedicated operations token;
- aggregate process/HTTP metrics and persisted AI input/output token + estimated-cost totals without organization/user metric labels;
- production rejects the development metrics token and preflight validates operational configuration;
- validated custom-format PostgreSQL backups with restrictive permissions and SHA-256 manifest;
- guarded restore drill that refuses non-test/restore/drill/e2e/ci targets;
- CI restore evidence: migrations → data marker → dump → empty restore DB → restore → marker verification → Prisma migration status;
- regression tests for limiter rollback/shared tenant budget, metrics privacy, Retry-After and security headers;
- deployment runbook documenting the operational boundary truthfully.

Final PR #33 Business Shield Quality gate passed frontend, backend with 22 migrations/tests/build/artifacts, secret-scan, Chromium E2E and independent backup-restore-drill.

Not claimed:
- Prometheus/Grafana/Sentry/PagerDuty or another external collector is deployed;
- alert routing/on-call notification is configured;
- encrypted off-host backup retention is configured;
- an infrastructure-level RPO/RTO SLO is measured.

## Integration candidate

Branch: `integration/strategy-p0-2026-08-12`
PR: #29
Base: `feat/product-v2-p26-enterprise-agency-v2`
GA merge commit: `35d576e3566286aa5afa0290de5bd8226f740890`.

The mandatory **post-GA combined PR #29 gate is pending on the latest integration head**. Production deployment remains forbidden until that combined gate is green and a separate production-safe lineage/deployment decision is made.

## Remaining P0 / GA boundaries

The following remain explicitly open even after repository-side GA readiness:

- self-serve payment acquiring/provider checkout/webhook validation/reconciliation; current commercial path is deliberately sales-assisted;
- transactional email/SMS delivery contracts and production retry/observability proof beyond the currently configured OTP/provider paths;
- production provider rollout beyond Google Business Profile;
- external metrics collector, dashboards, alert thresholds and on-call notification routing;
- encrypted off-host backup retention/scheduling and periodic infrastructure disaster-recovery exercises;
- production data-retention/purge behavior matching plan policy;
- proof methodology for any future public numerical claims/case studies.

## P1 / P26 continuation after GA gate

- usage UI + upgrade/downgrade flows and proration policy;
- notifications at 70/90/100 usage thresholds;
- external observability dashboards for API, worker, sync providers, AI and billing;
- expanded E2E: onboarding → source → review → AI draft → approval → reply → task → report;
- P26 scoped roles/API keys/service accounts;
- P26 signed outbound webhooks with retries/history/dead-letter/manual retry;
- P26 white-label/custom domains verification;
- P26 SAML/OIDC boundary, retention/purge, session/IP/step-up policies and audit export;
- P26 frontend workspace switcher + consolidated agency portfolio;
- design-system token consolidation and state-system audit;
- accessibility/keyboard/focus/reduced-motion pass;
- performance budgets for dashboard, reviews and analytics routes.

## Mandatory release gates

A candidate can be promoted only when all applicable gates are green:

1. frontend typecheck/lint/tests/production build;
2. backend Prisma generate + migrations + migration status + typecheck + tests + build;
3. secret scan;
4. browser E2E with HttpOnly session + isolated PostgreSQL;
5. isolated PostgreSQL backup/restore drill;
6. production preflight on the target host;
7. external HTTPS smoke (`/`, `/reviews`, `/api/v1/meta`, protected `/api/v1/me`);
8. exact deployed SHA equals the release manifest SHA;
9. API and worker systemd units active; nginx config valid;
10. no rollback-trigger condition active.

## Non-negotiable architecture rules

- Tenant isolation is server enforced.
- UI state never grants permissions or entitlements.
- Provider capabilities fail closed.
- Billing/checkout never fakes success client-side.
- Human managed services are not silently bundled into software entitlement logic.
- Critical review handling is not hard-disabled solely because a monthly soft meter was crossed.
- Expensive AI mutation budgets are shared through PostgreSQL rather than per-process memory.
- Operational metrics must not introduce tenant/user cardinality or leak identifiers.
- A backup capability is not considered proven until restore is exercised against an isolated database.
- Enterprise/P26 work must not weaken P0 security, billing truth, quota enforcement or tenant boundaries.
