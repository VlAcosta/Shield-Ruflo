import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { assertUsageLimit } from '../src/modules/billing/billing.service.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Strategy pricing tests require NODE_ENV=test and matching test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('Strategic four-tier pricing and entitlements', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const userId = randomUUID();
  const sessionToken = `strategy-pricing-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();
    const startPlan = await app.prisma.plan.findUniqueOrThrow({ where: { code: 'START' } });
    await app.prisma.organization.create({
      data: { id: organizationId, name: 'Strategy Pricing Org', slug: `strategy-pricing-${randomUUID()}` },
    });
    await app.prisma.user.create({
      data: {
        id: userId,
        phone: `+7998${String(Date.now()).slice(-7)}`,
        displayName: 'Strategy Pricing Owner',
        profileCompletedAt: new Date(),
      },
    });
    await app.prisma.organizationMember.create({
      data: { organizationId, userId, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
    });
    const business = await app.prisma.business.create({
      data: { organizationId, name: 'Strategy Business', isPrimary: true, status: 'ACTIVE' },
    });
    await app.prisma.location.create({
      data: { businessId: business.id, name: 'Main location', isPrimary: true, status: 'ACTIVE' },
    });
    await app.prisma.subscription.create({
      data: { organizationId, planId: startPlan.id, status: 'ACTIVE', provider: null, autoRenew: false },
    });
    await app.prisma.session.create({
      data: {
        userId,
        activeOrganizationId: organizationId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('publishes only START/GROWTH/PRO/BUSINESS with the audited prices', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/billing/catalog' });
    expect(response.statusCode).toBe(200);
    const plans = response.json().plans;
    expect(plans.map((plan: any) => plan.code)).toEqual(['START', 'GROWTH', 'PRO', 'BUSINESS']);
    expect(plans.map((plan: any) => plan.priceCents)).toEqual([349000, 899000, 1899000, 3990000]);
    expect(plans.some((plan: any) => plan.code === 'FREE')).toBe(false);

    expect(plans[0].entitlements).toMatchObject({
      'locations.max': 1,
      'review_sources.max': 5,
      'reviews.monthly': 300,
      'users.max': 2,
      'ai_actions.monthly': 150,
      'retention.months': 3,
    });
    expect(plans[1].entitlements).toMatchObject({
      'locations.max': 3,
      'reviews.monthly': 1500,
      'competitors.max': 3,
      'automation_rules.max': 10,
    });
    expect(plans[2].entitlements).toMatchObject({
      'locations.max': 10,
      'api_webhooks': true,
      'rbac.level': 'advanced',
    });
    expect(plans[3].entitlements).toMatchObject({
      'locations.max': 25,
      'users.max': 50,
      'retention.months': 36,
      agency: true,
      custom_terms: true,
    });
  });

  it('returns real tenant usage with 70/90/100-ready meter state', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/billing/usage', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const payload = response.json();
    expect(payload.plan).toMatchObject({ code: 'START' });
    const locations = payload.usage.meters.find((meter: any) => meter.key === 'locations');
    const users = payload.usage.meters.find((meter: any) => meter.key === 'users');
    expect(locations).toMatchObject({ used: 1, limit: 1, percentage: 100, state: 'limit' });
    expect(users).toMatchObject({ used: 1, limit: 2, percentage: 50, state: 'ok' });
  });

  it('enforces expansion limits without using review/AI hard blockers', async () => {
    await expect(assertUsageLimit(app, organizationId, 'locations.max')).rejects.toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
      statusCode: 409,
      details: expect.objectContaining({ entitlement: 'locations.max', used: 1, limit: 1 }),
    });
    await expect(assertUsageLimit(app, organizationId, 'users.max')).resolves.toBeUndefined();
  });
});
