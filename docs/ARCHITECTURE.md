# Business Shield Architecture

## Product boundary

Business Shield is a multi-tenant Reputation Operations platform. The primary tenant is `Organization`.

Every business-domain object that belongs to a customer is organization-scoped. Authorization is enforced on the server. Frontend permission checks exist only for UX and must never be treated as security boundaries.

## Runtime topology

```text
React Web App
     │
     │ HTTPS /api/v1
     ▼
Fastify API ───────────────┐
     │                     │
     │ Prisma              │ enqueue
     ▼                     ▼
PostgreSQL ◄──────── Durable Worker
     ▲                     │
     │                     ▼
     └──────── Provider / AI adapters
```

The application remains a modular monolith until a specific bounded context demonstrates an operational scaling requirement that cannot be solved cleanly within the current deployment model.

## Authority model

The backend is the only authoritative layer for:

- authentication and sessions;
- organization membership and active tenant;
- RBAC/permissions;
- billing and entitlements;
- provider credentials and connection lifecycle;
- external publish/send operations;
- audit logs;
- durable jobs and retry state.

Browser storage may cache UI preferences but may not become authoritative for business data or external state.

## Modules

Current P0–P12 foundation:

- `auth` — OTP/login/session lifecycle;
- `organizations` — tenant context and membership;
- `company` / onboarding / locations;
- `profile` / `team`;
- `reviews` — review inbox, reply drafts, approval flow;
- `dashboard` — PostgreSQL-backed reputation analytics;
- `tasks` — reputation operations CRM;
- `integrations` — provider lifecycle foundation and encrypted credentials;
- `jobs` — durable PostgreSQL worker queue;
- `operations` — automations, reports and notifications;
- `billing` / entitlements;
- `admin` — platform-admin gate and PostgreSQL-backed operational views.

V2 bounded contexts (P13–P26):

- provider adapter SDK;
- provider-independent review ingestion;
- AI intelligence + reply copilot;
- reputation cases;
- acquisition campaigns;
- competitive intelligence;
- AI visibility;
- listing/location health;
- conversational analytics;
- enterprise/agency hierarchy, API and SSO capabilities.

## Tenant isolation rules

1. Requests derive actor and organization from authenticated server context.
2. Client-supplied organization IDs are never trusted as authorization proof.
3. Reads and writes include organization scope in the database predicate.
4. Cross-tenant object lookup returns `404` where existence disclosure would leak information.
5. Background jobs persist `organizationId` and revalidate ownership before side effects.
6. Provider credentials are scoped to the owning organization/integration account.
7. Tests include explicit Organization A → Organization B escape attempts.

## External truth rules

External state uses explicit lifecycle values. A local request is not equivalent to provider success.

Examples:

```text
NOT_CONFIGURED
CONNECTING
CONNECTED
DEGRADED
DISCONNECTED

DRAFT
AWAITING_APPROVAL
APPROVED
READY_TO_PUBLISH
PUBLISHING
PUBLISH_UNKNOWN
PUBLISHED
FAILED
```

`CONNECTED`, `PUBLISHED`, `SENT` and `PAID` require authoritative confirmation from the responsible external system.

## Jobs

The current worker is PostgreSQL-backed and durable. Jobs require:

- idempotency keys;
- lease/claim semantics;
- retry with exponential backoff;
- maximum attempts;
- recovery of expired `RUNNING` leases;
- terminal/dead state;
- correlation identifiers;
- structured operational logs.

Do not add Kafka/RabbitMQ merely for architecture fashion. Re-evaluate queue infrastructure only after measured load demonstrates a need.

## API contracts

All public application APIs are versioned under `/api/v1`.

P14 introduces generated frontend contracts from the backend source of truth. Frontend code must not independently invent backend enums such as permissions, integration status, reply status or billing state.

## Security

Security is layered:

- HTTPS termination at Nginx;
- Fastify Helmet/CORS/rate controls;
- HttpOnly sessions;
- Secure production cookies;
- server-side RBAC;
- tenant predicates;
- encrypted credentials;
- log redaction;
- audit trails;
- CI SAST/dependency/secret scanning;
- isolated test databases.

PostgreSQL RLS may be evaluated later as defense-in-depth after application-level tenancy is stable and fully tested.

## Deployment principle

`main` is the intended production baseline after P13. Production deployment must come from an approved, green commit, not from an unreviewed working directory or ad-hoc server edits.
