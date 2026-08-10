# Business Shield

Business Shield is a multi-tenant Reputation Operations SaaS for local, multi-location and agency businesses.

The product converts external customer feedback into controlled operational work:

**Collect → Normalize → Understand → Prioritize → Respond → Act → Resolve → Measure → Improve.**

## Architecture

Business Shield is intentionally implemented as a modular monolith.

Runtime components:

- React web application;
- Fastify + TypeScript API;
- PostgreSQL-backed durable background worker;
- PostgreSQL + Prisma;
- provider adapter layer for external reputation systems;
- background jobs for provider sync, reply publication, reports and automations;
- Nginx/HTTPS in production.

The backend is authoritative for authentication, authorization, tenant isolation, entitlements, integrations, external side effects, billing state and audit trails.

## Repository layout

```text
backend/                 Fastify API, worker, Prisma and backend tests
src/                     React application
public/                  static frontend assets
scripts/                 development/deployment/quality scripts
e2e/                     Playwright browser tests
.github/workflows/       CI/security pipelines
docs/                    architecture, security and operations docs
```

## Requirements

- Node.js 22.23.x recommended; backend supports Node >=22.12 <25.
- npm 10.x.
- PostgreSQL 16 recommended.
- Docker is optional for local PostgreSQL but used by the current VPS deployment.

## Local development

### Frontend

```bash
npm ci
npm start
```

The frontend currently uses the `/api/v1` same-origin API contract. P14 migrates the existing application incrementally from Create React App to Vite + TypeScript; do not introduce new CRA-specific infrastructure.

### Backend

```bash
cd backend
cp .env.example .env
npm ci
npm run prisma:generate
npm run db:deploy
npm run dev
```

Run the worker in another terminal:

```bash
cd backend
npm run dev:worker
```

## Environment

Never commit `.env`, OTP codes, cookies, provider credentials or database credentials.

Important backend variables include:

```text
NODE_ENV
HOST
PORT
DATABASE_URL
AUTH_SECRET
AUTH_COOKIE_NAME
AUTH_COOKIE_SECURE
AUTH_COOKIE_SAME_SITE
AUTH_OTP_PROVIDER
AUTH_OTP_WEBHOOK_URL
AUTH_OTP_WEBHOOK_TOKEN
COMPANY_LOOKUP_PROVIDER
CORS_ORIGINS
PLATFORM_ADMIN_IDENTITIES
INTEGRATION_CREDENTIALS_KEY
```

Production configuration is deliberately stricter than development. Console/fixed/debug OTP modes, insecure cookies and default secrets must not be used for a production release.

See `backend/.env.example` and `scripts/production-preflight.sh` for the executable source of truth.

## Database migrations

Development migration creation:

```bash
cd backend
npm run db:migrate
```

Production/staging application of committed migrations:

```bash
cd backend
npm run db:status
npm run db:deploy
npm run db:status
```

Never run `prisma migrate dev` against production.

## Testing

Frontend:

```bash
npm run lint
CI=true npm run test:ci
CI=true npm run build
```

Backend unit and isolated integration tests are executed by GitHub Actions against a dedicated PostgreSQL test database.

```bash
cd backend
npm run typecheck
npm test
npm run build
```

Integration tests that write fixtures must require `NODE_ENV=test` and an explicit `TEST_DATABASE_URL` pointing at a test-only database. Do not run fixture integration suites against the production database.

Browser E2E:

```bash
npm run test:e2e:p0
```

CI validates the real HttpOnly-session + PostgreSQL Reviews path in Chromium.

## Deployment

Current production topology:

```text
Internet
  ↓ HTTPS
Nginx
  ├─ React static build
  └─ /api/v1/* → Fastify API (127.0.0.1:8081)
                    ↓
                 PostgreSQL
                    ↑
             durable worker
```

Typical deployment sequence:

1. confirm CI is green;
2. back up PostgreSQL and environment configuration;
3. pull the approved production commit;
4. `npm ci` and build frontend/backend;
5. `prisma migrate deploy`;
6. restart API and worker systemd services;
7. verify `/health` and `/health/ready`;
8. perform external HTTPS smoke tests and browser authentication checks.

The repository includes `scripts/install-production-services.sh` and `scripts/production-preflight.sh` for the current VPS topology.

## Security principles

- HttpOnly + Secure production session cookies;
- server-side RBAC and organization-scoped authorization;
- tenant IDs are derived from authenticated server context, never trusted from the browser;
- integration credentials are encrypted at rest and are never returned to the frontend;
- no fake `CONNECTED`, `PUBLISHED`, `PAID`, `SENT` or external-success state;
- sensitive mutations generate audit events;
- dependency, secret and SAST checks are release gates;
- production data must never be used as an integration-test fixture database.

## Product roadmap

P0–P12 established the production backend foundation: auth, organizations, RBAC, company/onboarding, profile/team, reviews, analytics, tasks, integrations, durable jobs, operations, billing/entitlements and release hardening.

The V2 roadmap continues with P13–P26:

- release/security gate;
- Vite + TypeScript frontend modernization;
- provider adapter SDK and Google Business Profile reference adapter;
- provider-independent review ingestion;
- AI Review Intelligence and Reply Copilot;
- Reputation Cases;
- Review Acquisition;
- Competitive Intelligence;
- AI Visibility;
- Listings/Location Health;
- Ask Shield;
- Enterprise/Agency capabilities.

## Production truth rule

Business Shield must never claim that an external operation succeeded until the authoritative external system confirms it. Unknown or degraded states are first-class product states and must be surfaced explicitly.
