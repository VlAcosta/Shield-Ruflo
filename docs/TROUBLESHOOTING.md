# Business Shield Troubleshooting

## `npm ci` reports lockfile mismatch

Do not replace `npm ci` with a permanent `npm install` workaround.

Regenerate the lockfile using the repository-supported Node/npm version, commit the lockfile, and verify a clean `npm ci` in CI.

## Frontend build fails only in CI

CI treats warnings as release failures. Run locally:

```bash
npm run lint
CI=true npm run test:ci
CI=true npm run build
```

Fix warnings instead of disabling the CI behavior.

## `/api/v1/*` returns Nginx HTML 404

The request has not reached Fastify. Verify the Nginx `/api/` proxy and inspect the active configuration with `nginx -T`.

## `/api/v1/*` returns 502

Verify:

```bash
systemctl status bis-shield-api
ss -ltnp | grep 8081
journalctl -u bis-shield-api -n 100 --no-pager
```

The API should listen only on the configured local interface in the current VPS topology.

## `/health/ready` returns 503

Check PostgreSQL container state, `DATABASE_URL`, credentials and migration status.

```bash
docker ps --filter name=bis-shield-postgres
cd backend
npm run db:status
```

## Admin endpoints return `403`

Platform admin access requires both:

1. a valid authenticated HttpOnly session;
2. the login identity to be explicitly present in server-side `PLATFORM_ADMIN_IDENTITIES`.

A browser PIN is not an authorization boundary.

An empty allowlist intentionally denies platform admin access for everyone.

## Integration test returns `403` for platform admin on a normal server

Do not add a fake CI administrator to production configuration just to make a test pass. Platform-data integration tests are designed to run only with `NODE_ENV=test`, an explicit `TEST_DATABASE_URL`, and a test-only database name.

## `prisma migrate dev` asks to reset data

Stop. Do not reset production/staging data.

Use committed migrations and `npm run db:deploy` for non-development environments. Investigate drift separately.

## Worker is inactive

```bash
systemctl status bis-shield-worker
journalctl -u bis-shield-worker -n 100 --no-pager
```

The worker requires the same backend environment file and database connectivity as the API.

## A provider operation shows `NOT_CONFIGURED`/`UNAVAILABLE`

This is expected when a real external adapter or credentials are absent. Do not replace it with a fake success state. P15+ provider adapters expose explicit capabilities and health state.

## Registration works in development but production preflight fails

Development may use console OTP. Production intentionally rejects it. Configure a real HTTPS OTP provider before switching `NODE_ENV=production`.
