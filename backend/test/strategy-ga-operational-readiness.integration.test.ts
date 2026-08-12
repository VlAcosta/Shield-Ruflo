import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { operationsConfig } from '../src/config/operations.config.js';
import { AppError } from '../src/core/errors/app-error.js';
import { assertAiRequestBudget } from '../src/shared/operations/ai-request-budget.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|ga|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('GA readiness integration tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('Strategy GA operational readiness', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const userId = randomUUID();
  const secondUserId = randomUUID();

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.create({
      data: { id: organizationId, name: 'GA Readiness Org', slug: `ga-readiness-${randomUUID()}` },
    });
    await app.prisma.user.createMany({
      data: [
        { id: userId, phone: `+7991${String(Date.now()).slice(-7)}`, displayName: 'GA User One' },
        { id: secondUserId, phone: `+7992${String(Date.now()).slice(-7)}`, displayName: 'GA User Two' },
      ],
    });

    app.get('/__test/ga-rate-limit-error', async () => {
      throw new AppError({
        code: 'TEST_RATE_LIMITED',
        message: 'Test rate limit',
        statusCode: 429,
        details: { retryAfter: 17 },
      });
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userId, secondUserId] } } });
    await app.close();
  });

  it('enforces the per-user budget transactionally without consuming rejected attempts', async () => {
    const options = { userLimit: 2, tenantLimit: 10, windowSeconds: 60 };
    await expect(assertAiRequestBudget(app, { organizationId, userId }, options)).resolves.toBeUndefined();
    await expect(assertAiRequestBudget(app, { organizationId, userId }, options)).resolves.toBeUndefined();

    await expect(assertAiRequestBudget(app, { organizationId, userId }, options)).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      statusCode: 429,
      details: expect.objectContaining({ scope: 'user', limit: 2, retryAfter: expect.any(Number) }),
    });

    const bucket = await app.prisma.operationalRateLimitBucket.findUniqueOrThrow({
      where: { key: `ai:user:${organizationId}:${userId}` },
    });
    expect(bucket.count).toBe(2);
  });

  it('shares a tenant budget across users and rolls back both buckets when the tenant is full', async () => {
    await app.prisma.operationalRateLimitBucket.deleteMany({ where: { organizationId } });
    const options = { userLimit: 2, tenantLimit: 2, windowSeconds: 60 };

    await expect(assertAiRequestBudget(app, { organizationId, userId }, options)).resolves.toBeUndefined();
    await expect(assertAiRequestBudget(app, { organizationId, userId: secondUserId }, options)).resolves.toBeUndefined();
    await expect(assertAiRequestBudget(app, { organizationId, userId }, options)).rejects.toMatchObject({
      code: 'AI_RATE_LIMITED',
      details: expect.objectContaining({ scope: 'tenant', limit: 2 }),
    });

    const tenantBucket = await app.prisma.operationalRateLimitBucket.findUniqueOrThrow({
      where: { key: `ai:tenant:${organizationId}` },
    });
    const firstUserBucket = await app.prisma.operationalRateLimitBucket.findUniqueOrThrow({
      where: { key: `ai:user:${organizationId}:${userId}` },
    });
    expect(tenantBucket.count).toBe(2);
    expect(firstUserBucket.count).toBe(1);
  });

  it('emits Retry-After for bounded 429 responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/__test/ga-rate-limit-error' });
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('17');
    expect(response.json()).toMatchObject({
      error: { code: 'TEST_RATE_LIMITED', details: { retryAfter: 17 } },
    });
  });

  it('protects operational metrics and exposes only aggregate operational labels', async () => {
    const unauthorized = await app.inject({ method: 'GET', url: '/internal/metrics' });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toMatchObject({ error: { code: 'OPERATIONS_METRICS_UNAUTHORIZED' } });

    const authorized = await app.inject({
      method: 'GET',
      url: '/internal/metrics',
      headers: { 'x-operations-token': operationsConfig.OPERATIONS_METRICS_TOKEN },
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.headers['cache-control']).toBe('no-store');
    expect(authorized.headers['content-type']).toContain('text/plain');
    expect(authorized.body).toContain('business_shield_process_uptime_seconds');
    expect(authorized.body).toContain('business_shield_ai_estimated_cost_micros_total');
    expect(authorized.body).toContain('business_shield_operational_rate_limit_buckets');
    expect(authorized.body).toContain('business_shield_http_requests_total');
    expect(authorized.body).not.toContain(organizationId);
    expect(authorized.body).not.toContain(userId);
    expect(authorized.body).not.toContain(secondUserId);
  });

  it('preserves hardened security headers on public health traffic', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['cross-origin-resource-policy']).toBe('same-site');
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
  });
});
