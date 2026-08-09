# BUSINESS SHIELD ENGINEERING CONSTITUTION

## Mission

Transform Business Shield into a production-grade commercial
Reputation Operations SaaS.

Ruflo and Codex are authorized to modify the entire stack.

Allowed areas include:
- frontend
- backend
- database
- APIs
- authentication
- authorization
- RBAC
- integrations
- background workers
- queues
- realtime
- billing
- AI features
- infrastructure
- CI/CD
- tests
- observability
- security

## Core Execution Model

Ruflo is the orchestration, coordination, policy and memory layer.

Codex is the executor.

Ruflo coordinates.
Codex inspects, edits, creates files, runs commands and tests.

Never stop after creating Ruflo coordination records.
Continue actual implementation with Codex.

## Product Principle

Business Shield is a Reputation Operations System,
not merely a review dashboard.

Reviews are a core product domain.

## Architecture Principles

Prefer explicit domain boundaries.

Frontend must not directly own backend business logic.

Use:

UI
→ feature
→ application/service layer
→ API
→ backend service
→ persistence/integration

Backend owns:
- authorization
- business rules
- tenant isolation
- integrations
- secrets
- billing state
- security-sensitive operations

## SaaS Architecture

The system must be designed as multi-tenant.

Primary tenant:
Organization

Users access organizations through memberships.

All business-owned data must be tenant-scoped.

## Truthfulness

Never fake successful external operations.

Never show:
Connected
Synced
Published
Paid
Authorized

unless the corresponding operation actually succeeded.

## Security

Never commit secrets.

Never store provider/API secrets in frontend code.

Never rely on frontend RBAC for security.

Backend authorization is mandatory.

Validate untrusted input.

Apply least privilege.

Security-sensitive changes require security review.

## Database

Destructive database migrations require explicit analysis.

Never silently destroy production-compatible data.

Schema changes require migrations.

## Dependencies

Do not introduce dependencies without a concrete benefit.

Prefer existing project abstractions where suitable.

Avoid unnecessary framework churn.

## Existing Product

Preserve existing user-visible functionality unless
the task explicitly replaces it.

Refactor incrementally instead of blindly rewriting the repository.

## UX Quality

All primary interfaces must support:

- loading
- empty
- error
- unavailable/offline states where applicable
- responsive layouts
- keyboard interaction
- accessible semantics
- light theme
- dark theme

Primary target viewports:

2560/2K
1920
1240
980
480

## Engineering Quality Gates

A meaningful feature is not complete until applicable checks pass:

Architecture
Typecheck
Lint
Unit tests
Integration tests
E2E tests
Frontend build
Backend build
Security review
Authorization review
Responsive review
Dark/light theme review
Accessibility review
Error handling
Regression review

## Git Safety

Work incrementally.

Inspect before editing.

Do not delete unrelated functionality.

Do not rewrite large subsystems without architecture justification.

Never push secrets.

Never force-push shared branches automatically.

## Memory Policy

Before meaningful tasks:
search Ruflo memory.

After successful solutions:
store reusable architectural decisions, fixes and patterns.

Do not store secrets or credentials in Ruflo memory.

## ADR Policy

Significant architectural decisions must create or update an ADR in:

docs/adr/

Examples:

backend framework
database
multi-tenancy
authentication
RBAC
queues
billing
integration architecture
AI provider architecture

## Definition of Done

"Build passes" alone is not sufficient.

The implementation must solve the product problem,
respect architecture,
pass relevant quality gates,
and leave the repository in a maintainable state.