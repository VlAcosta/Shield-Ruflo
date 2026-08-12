# Business Shield Deployment Runbook

## Preconditions

Deploy only a commit whose required CI checks are green.

Before touching production:

1. verify the intended commit SHA;
2. create a PostgreSQL backup and verify its SHA-256 manifest;
3. back up `backend/.env` securely;
4. confirm disk space and PostgreSQL container health;
5. confirm the previous release SHA for rollback;
6. confirm the latest isolated backup/restore drill passed CI.

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

## Operational metrics

The API exposes a private Prometheus-text endpoint at `/internal/metrics`. It is not a public product API and requires the `x-operations-token` header.

```bash
curl -fsS \
  -H "x-operations-token: $OPERATIONS_METRICS_TOKEN" \
  http://127.0.0.1:8081/internal/metrics
```

The endpoint exposes aggregate process/HTTP metrics plus persisted AI token and estimated-cost totals from supported AI domains. It deliberately does not label metrics by organization or user.

`OPERATIONS_METRICS_TOKEN` must be a unique random value of at least 32 characters in production. The token is redacted from application logs and production preflight rejects the development default.

This endpoint **does not mean that Prometheus, Grafana, Sentry, PagerDuty or any external alert collector is configured**. Collector installation, scrape-network restrictions, alert rules and notification routing remain separate infrastructure tasks and must not be claimed as complete until they are actually deployed and tested.

## Expensive AI request budgets

Paid/enqueued AI mutation paths use shared PostgreSQL-backed minute budgets. Defaults are:

```dotenv
AI_RATE_LIMIT_USER_PER_MINUTE=20
AI_RATE_LIMIT_TENANT_PER_MINUTE=100
```

The tenant budget must be greater than or equal to the per-user budget. A rejected request returns `429 AI_RATE_LIMITED` with `Retry-After`; the rejected transaction does not consume another budget slot. Read-only AI state and normal reviews/dashboard traffic are not governed by this AI budget.

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
- a missing/default operations metrics token;
- invalid expensive-AI budget configuration;
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

Create a private custom-format PostgreSQL backup outside the application checkout whenever possible:

```bash
BACKUP_DIR=/var/backups/business-shield \
DATABASE_URL="$DATABASE_URL" \
bash scripts/database-backup.sh
```

The command uses restrictive file permissions, validates the dump with `pg_restore --list`, and writes a `.sha256` sidecar. A production release must not proceed unless backup creation and validation succeed.

### Restore drill

Restore drills are intentionally guarded and may run only against an empty database whose name clearly contains `test`, `restore`, `drill`, `e2e`, or `ci`. Never point the drill at production.

```bash
BACKUP_FILE=/secure/path/business-shield.dump \
SOURCE_DATABASE_URL="$DATABASE_URL" \
RESTORE_DATABASE_URL='postgresql://.../business_shield_restore' \
bash scripts/database-restore-drill.sh
```

The drill verifies the SHA-256 manifest, restores the custom dump, confirms core tables and applied Prisma migrations, and fails closed for a non-drill database name. CI additionally verifies a data marker and runs `prisma migrate status` against the restored database.

Backup encryption, off-host retention, retention schedules and provider-level disaster recovery are infrastructure responsibilities beyond this repository script. They must be configured and periodically tested before claiming a full disaster-recovery program.
