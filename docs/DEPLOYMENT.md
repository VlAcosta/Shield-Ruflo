# Business Shield Deployment Runbook

## Preconditions

Deploy only a commit whose required CI checks are green.

Before touching production:

1. verify the intended commit SHA;
2. create a PostgreSQL backup;
3. back up `backend/.env` securely;
4. confirm disk space and PostgreSQL container health;
5. confirm the previous release SHA for rollback.

## Build

Frontend:

```bash
npm ci
npm run lint
CI=true npm run test:ci
CI=true npm run build
```

Backend:

```bash
cd backend
npm ci
npm run prisma:generate
npm run typecheck
npm run build
```

Do not run fixture-writing integration tests against a production `DATABASE_URL`. Those tests belong in CI with an explicit test-only PostgreSQL database.

## Database

Inspect first:

```bash
cd backend
npm run db:status
```

Apply committed migrations:

```bash
npm run db:deploy
npm run db:status
```

`prisma migrate dev` is forbidden on production.

## Runtime services

Business Shield runs two Node processes:

- `bis-shield-api` → `backend/dist/server.js`;
- `bis-shield-worker` → `backend/dist/worker.js`.

Install/update service units with:

```bash
./scripts/install-production-services.sh
```

Then verify:

```bash
systemctl is-active bis-shield-api
systemctl is-active bis-shield-worker
```

## Health checks

Local API:

```bash
curl -fsS http://127.0.0.1:8081/health
curl -fsS http://127.0.0.1:8081/health/ready
```

The readiness endpoint must confirm database availability.

External HTTPS:

```bash
./scripts/production-smoke.sh
```

The smoke script checks:

- `https://bis-shield.ru/` → `200`;
- `https://bis-shield.ru/reviews` → `200` to prove SPA fallback routing;
- `https://bis-shield.ru/api/v1/me` → `401` for an unauthenticated request, proving that HTTPS/nginx reaches the API authorization boundary.

To smoke-test another release hostname without editing the script:

```bash
BASE_URL=https://staging.example.com ./scripts/production-smoke.sh
```

## Production preflight

Before a GA/production-mode release:

```bash
./scripts/production-preflight.sh
```

The preflight must reject at least:

- default/weak authentication secret;
- insecure production cookies;
- console/fixed/debug OTP;
- mock company lookup;
- missing production build artifacts;
- unavailable database/API/worker prerequisites.

A production gate is complete only when **both** `production-preflight.sh` on the host and `production-smoke.sh` against the public HTTPS origin pass.

## Rollback

Application rollback:

1. stop API/worker if a schema incompatibility makes the release unsafe;
2. restore the previously approved source SHA;
3. rebuild frontend/backend;
4. restart services;
5. verify health and critical user flows.

Database migrations are not automatically reversible. A rollback that requires destructive schema reversal must be planned and reviewed separately. Prefer backward-compatible expand/contract migrations.

## Backups

A production release must not proceed unless the PostgreSQL backup command completes successfully and the resulting file is non-empty.

Backups should be retained outside the application checkout. For enterprise readiness, backup encryption and off-host retention are required.
