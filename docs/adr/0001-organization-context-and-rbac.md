# ADR 0001: Organization context and server-side RBAC

- Status: Accepted
- Date: 2026-08-09
- Milestone: P2

## Context

Business Shield is a multi-tenant SaaS. `Organization` is the tenant security boundary, and a user may belong to more than one organization through `OrganizationMember` records. Authentication alone therefore cannot determine which tenant data a request may access.

The existing backend already stores `Session.activeOrganizationId`, resolves an authenticated membership, and provides centralized Fastify `authenticate` and `authorize(permission)` hooks. P2 formalizes these mechanisms and the permission vocabulary instead of replacing them.

Frontend role checks are useful for navigation and action visibility, but browser state is untrusted and cannot authorize access. Membership mutations also need a concurrency-safe rule ensuring an organization always retains an active owner.

## Decision

### Tenant context

The active organization is session-scoped. Each server session stores its own nullable `activeOrganizationId`; changing one session does not implicitly change a user's other sessions.

Authentication resolves the session, user, active membership, role, and effective permissions into `request.auth`. A usable membership must:

- belong to the authenticated user;
- have `ACTIVE` status;
- not have an expired `accessExpiresAt` value; and
- belong to an `ACTIVE` organization.

Tenant-owned services receive the organization identifier from `request.auth`, not from an untrusted request body. Resource identifiers supplied by clients are resolved with the authenticated organization constraint or through a tenant-scoped `requireActiveX` helper.

### Organization switching

The switch endpoint accepts a target organization identifier but treats it only as a lookup key. The backend verifies a usable membership for the authenticated user before updating that session's `activeOrganizationId`.

A rejected switch must not alter the session. A successful switch returns refreshed organization and permission context and is auditable. Subsequent requests and session restoration derive their context from the persisted server session; local storage is not authoritative.

If a selected membership later becomes unusable, protected tenant operations must not continue under that tenant. Initial session establishment may choose a deterministic usable membership. Runtime repair or fallback must never select a tenant for which the user lacks a usable membership and must be documented consistently by the API.

### Canonical permissions

The backend permission catalog is the canonical vocabulary. P2 requires at least:

- `dashboard.view`
- `business.view`, `business.manage`
- `locations.view`, `locations.manage`
- `reviews.view`, `reviews.reply`, `reviews.moderate`, `reviews.settings`
- `tasks.view`, `tasks.manage`
- `team.view`, `team.manage`
- `integrations.view`, `integrations.manage`
- `automations.view`, `automations.manage`
- `analytics.view`
- `billing.view`, `billing.manage`

The system roles are `OWNER`, `ADMIN`, `MANAGER`, `ANALYST`, and `MEMBER`. Their baseline grants are defined centrally in backend code. Routes declare permissions through `authorize(permission)` and must not contain scattered role-name checks. Domain invariants may additionally restrict sensitive operations, such as changing an owner.

Legacy, more specific permissions may be retained during incremental migration, but aliases and mappings must be explicit. The frontend must consume effective permissions returned by the backend instead of maintaining a divergent security policy.

### Permission overrides and delegation ceiling

Membership overrides contain canonical `allow` and `deny` lists. Unknown permission names are rejected or ignored safely and never create authority.

Effective permissions are evaluated as the validated role baseline plus permitted grants, then minus denials. A denial always wins when the same permission appears in both lists.

An override grant is constrained at mutation time by a delegation ceiling:

- the managing actor cannot grant a permission they do not effectively hold;
- owner-only authority cannot be obtained through an override; the target must be promoted to `OWNER` through the protected owner workflow; and
- an override cannot bypass tenant membership state, organization state, entitlement checks, or domain invariants.

These rules prevent an administrator from manufacturing stronger authority through crafted override payloads while retaining useful per-member customization.

### Authorization and error semantics

The backend is the authority. `authenticate` establishes identity and tenant context; `authorize(permission)` enforces the effective permission before the handler executes. Frontend permission checks are UX only.

Responses use these semantics:

- `401` when no valid authenticated session exists;
- `409` when authentication is valid but no active organization context is selected;
- `403` when the active tenant context is valid but the caller lacks a required permission; and
- `404` when a supplied organization or tenant-owned resource is absent from the active tenant, including foreign-tenant identifiers, to avoid disclosing its existence.

### Last-owner invariant

An organization must retain at least one usable owner. Removing, suspending, demoting, or setting an access expiration on an owner must be rejected when it would leave no other usable `OWNER` membership.

The invariant is checked and the mutation is performed in the same PostgreSQL transaction. Membership mutation transactions use serializable isolation with bounded retry for serialization conflicts, or an equivalent organization-scoped database lock. The target membership and usable-owner count are re-read inside that protected transaction. A check performed before the transaction is insufficient because concurrent requests could both observe two owners and remove the last two.

Owner protection is a domain invariant in addition to permission checks. Only an owner may promote a member to owner or mutate an existing owner's protected role/security state.

## Alternatives considered

### Client-selected organization on every request

Rejected. Trusting a header, query value, or body `organizationId` as authority increases IDOR risk and makes session restoration inconsistent. Client identifiers remain lookup inputs validated against the authenticated session tenant.

### Global active organization on the user record

Rejected. A global value causes one browser or device to change the tenant context of other active sessions and creates surprising cross-session behavior.

### Role checks directly in route handlers

Rejected. Scattered checks drift over time, make auditing difficult, and cannot consistently support granular permissions or overrides.

### Frontend-maintained RBAC policy

Rejected as a security mechanism. Browser state is mutable. The frontend may mirror backend results for UX but cannot grant API access.

### Count owners before starting the mutation transaction

Rejected. It is vulnerable to concurrent demotion, suspension, expiration, or removal requests.

### Database trigger for all RBAC policy

Not selected for P2. A trigger could enforce part of the owner invariant, but it would duplicate application policy and complicate error reporting. Serializable application transactions provide the required correctness with the current Prisma/PostgreSQL architecture. A database constraint or trigger may be reconsidered if additional writers are introduced.

## Consequences

### Positive

- Tenant selection survives reload and remains isolated per session.
- Authorization policy is reviewable from one backend catalog and one guard mechanism.
- Foreign identifiers do not reveal cross-tenant resource existence.
- Permission customization cannot exceed the delegating actor or create owner authority.
- Concurrent membership changes cannot remove the last usable owner.
- Frontend behavior can remain responsive without becoming a security boundary.

### Costs and risks

- Existing frontend and backend permission names require an incremental compatibility migration.
- Serializable membership mutations require bounded retry handling and concurrency tests.
- Permission-changing responses must refresh cached session/membership context to avoid stale UX.
- Future tenant-owned modules must consistently use authenticated organization scope and centralized authorization.

## Validation

P2 validation includes:

- unit tests for every role baseline, unknown permissions, delegation ceilings, and deny precedence;
- API tests for `401`, missing-context `409`, permission `403`, and foreign-resource `404` behavior;
- organization-switch tests covering persistence, multiple sessions, foreign, suspended, and expired memberships;
- tenant escape tests with two organizations and resources in each;
- concurrent last-owner removal, suspension, demotion, and expiration tests; and
- frontend tests confirming that server-returned permissions only control UX and missing context defaults to least privilege.
