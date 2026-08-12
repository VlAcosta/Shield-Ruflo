# Business Shield — Strategic P0 Execution Ledger

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
- fake local demo checkout and hardcoded promo success removed; checkout fails closed through the backend/HttpOnly-session contract.

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
- unsupported vanity claims removed from the active landing surface (including unverified client/review/team/case metrics);
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

## Integration candidate

Branch: `integration/strategy-p0-2026-08-12`
PR: #29
Base: `feat/product-v2-p26-enterprise-agency-v2`

Production deployment: **forbidden until combined PR quality gate is green and a separate production-safe lineage decision is made.**

## Remaining P0 / GA blockers

The following are not considered closed by this integration candidate:

- payment provider contract: real production checkout/webhook/reconciliation or explicit sales-assisted billing boundary;
- transactional email/SMS delivery contracts and production retry/observability proof;
- production provider rollout beyond Google Business Profile;
- final GA secrets/CORS/rate-limit/security-headers review against production environment;
- backup + restore drill with measured RPO/RTO;
- error tracking / metrics / alerting thresholds and incident runbook validation;
- production data-retention/purge behavior matching plan policy;
- proof methodology for any future public numerical claims/case studies.

## P1 after P0 gate

- full entitlement middleware on premium capabilities (not only capacity limits);
- usage UI + upgrade/downgrade flows and proration policy;
- notifications at 70/90/100 usage thresholds;
- observability dashboards for API, worker, sync providers, AI and billing;
- expanded E2E: onboarding → source → review → AI draft → approval → reply → task → report;
- design-system token consolidation and state-system audit;
- accessibility/keyboard/focus/reduced-motion pass;
- performance budgets for dashboard, reviews and analytics routes.

## Mandatory release gates

A candidate can be promoted only when all applicable gates are green:

1. frontend typecheck/lint/tests/production build;
2. backend Prisma generate + migrations + migration status + typecheck + tests + build;
3. secret scan;
4. browser E2E with HttpOnly session + isolated PostgreSQL;
5. production preflight on the target host;
6. external HTTPS smoke (`/`, `/reviews`, `/api/v1/meta`, protected `/api/v1/me`);
7. exact deployed SHA equals the release manifest SHA;
8. API and worker systemd units active; nginx config valid;
9. no rollback-trigger condition active.

## Non-negotiable architecture rules

- Tenant isolation is server enforced.
- UI state never grants permissions or entitlements.
- Provider capabilities fail closed.
- Billing/checkout never fakes success client-side.
- Human managed services are not silently bundled into software entitlement logic.
- Critical review handling is not hard-disabled solely because a monthly soft meter was crossed.
- Enterprise/P26 work must not weaken P0 security, billing truth or tenant boundaries.
