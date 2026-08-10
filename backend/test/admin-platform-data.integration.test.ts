import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const adminIdentity = env.PLATFORM_ADMIN_IDENTITIES[0] ?? '';
const describeWithPostgres = integrationDatabaseUrl && adminIdentity ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Admin platform integration tests require an explicit test database');
}

describeWithPostgres('Platform admin server-backed data', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const adminUserId = randomUUID();
  const regularUserId = randomUUID();
  const adminToken = `platform-data-admin-${randomUUID()}`;
  const regularToken = `platform-data-regular-${randomUUID()}`;
  const adminCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(adminToken)}`;
  const regularCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(regularToken)}`;
  const planCode = `ADMINTEST${Date.now()}`;

  beforeAll(async () => {
    app = await buildApp();
    const adminUsesEmail = adminIdentity.includes('@');
    await app.prisma.user.createMany({
      data: [
        {
          id: adminUserId,
          email: adminUsesEmail ? adminIdentity : `platform-admin-${randomUUID()}@example.test`,
          phone: adminUsesEmail ? `+7${Date.now()}71` : adminIdentity,
          displayName: 'Platform Data Admin',
          profileCompletedAt: new Date(),
        },
        {
          id: regularUserId,
          email: `regular-${randomUUID()}@example.test`,
          phone: `+7${Date.now()}72`,
          displayName: 'Regular User',
          profileCompletedAt: new Date(),
        },
      ],
    });
    await app.prisma.organization.create({
      data: {
        id: organizationId,
        name: 'Real PostgreSQL Client',
        legalName: 'ООО «Real PostgreSQL Client»',
        inn: '7701234567',
        industry: 'Retail',
        onboardingStatus: 'COMPLETED',
      },
    });
    await app.prisma.organizationMember.create({
      data: { organizationId, userId: regularUserId, role: 'OWNER', status: 'ACTIVE' },
    });
    const plan = await app.prisma.plan.create({
      data: { code: planCode, name: 'Admin Integration Plan', priceCents: 199900, currency: 'RUB', active: true },
    });
    await app.prisma.subscription.create({
      data: { organizationId, planId: plan.id, status: 'ACTIVE', autoRenew: true },
    });
    const business = await app.prisma.business.create({
      data: { organizationId, name: 'Real PostgreSQL Client', isPrimary: true },
    });
    const source = await app.prisma.reviewSource.create({
      data: { organizationId, businessId: business.id, provider: 'admin-test', name: 'Admin Test Source' },
    });
    await app.prisma.review.create({
      data: {
        organizationId,
        businessId: business.id,
        sourceId: source.id,
        externalId: `admin-review-${randomUUID()}`,
        rating: 5,
        text: 'Real review for platform admin analytics',
      },
    });
    await app.prisma.session.createMany({
      data: [
        { userId: adminUserId, tokenHash: hashSessionToken(adminToken), expiresAt: new Date(Date.now() + 600_000) },
        { userId: regularUserId, activeOrganizationId: organizationId, tokenHash: hashSessionToken(regularToken), expiresAt: new Date(Date.now() + 600_000) },
      ],
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.plan.deleteMany({ where: { code: planCode } });
    await app.prisma.user.deleteMany({ where: { id: { in: [adminUserId, regularUserId] } } });
    await app.close();
  });

  it('serves real PostgreSQL clients, billing and analytics to an allowlisted platform admin', async () => {
    const clients = await app.inject({ method: 'GET', url: '/api/v1/admin/clients', headers: { cookie: adminCookie } });
    expect(clients.statusCode).toBe(200);
    expect(clients.json().source).toBe('api');
    expect(clients.json().clients).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: organizationId,
        name: 'ООО «Real PostgreSQL Client»',
        inn: '7701234567',
        plan: 'Admin Integration Plan',
        status: 'active',
        revenue: 1999,
        rating: 5,
        autoRenew: true,
      }),
    ]));

    const dashboard = await app.inject({ method: 'GET', url: '/api/v1/admin/dashboard', headers: { cookie: adminCookie } });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().measured).toBe(true);
    expect(dashboard.json().clients.map((item: { id: string }) => item.id)).toContain(organizationId);
    expect(dashboard.json().supportConfigured).toBe(false);

    const billing = await app.inject({ method: 'GET', url: '/api/v1/admin/subscriptions', headers: { cookie: adminCookie } });
    expect(billing.statusCode).toBe(200);
    expect(billing.json().paymentHistoryConfigured).toBe(false);
    expect(billing.json().subscriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientId: organizationId, planName: 'Admin Integration Plan', revenue: 1999 }),
    ]));

    const analytics = await app.inject({ method: 'GET', url: '/api/v1/admin/analytics?period=month', headers: { cookie: adminCookie } });
    expect(analytics.statusCode).toBe(200);
    expect(analytics.json().source).toBe('api');
    expect(analytics.json().platforms).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'admin-test', reviews: 1, rating: 5 }),
    ]));
  });

  it('returns truthful not-configured states instead of demo managers, tickets and settings', async () => {
    const managers = await app.inject({ method: 'GET', url: '/api/v1/admin/managers', headers: { cookie: adminCookie } });
    expect(managers.statusCode).toBe(200);
    expect(managers.json()).toMatchObject({ managers: [], configured: false, source: 'api' });

    const tickets = await app.inject({ method: 'GET', url: '/api/v1/admin/tickets', headers: { cookie: adminCookie } });
    expect(tickets.statusCode).toBe(200);
    expect(tickets.json()).toMatchObject({ tickets: [], configured: false, source: 'api' });

    const settings = await app.inject({ method: 'GET', url: '/api/v1/admin/settings', headers: { cookie: adminCookie } });
    expect(settings.statusCode).toBe(200);
    expect(settings.json()).toMatchObject({
      source: 'api',
      capabilities: { smtp: false, platformIntegrations: false, supportTickets: false, supportManagers: false, replyTemplates: false },
    });

    const createManager = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/managers',
      headers: { cookie: adminCookie },
      payload: { name: 'Fake success must not happen' },
    });
    expect(createManager.statusCode).toBe(501);
    expect(createManager.json()).toMatchObject({ error: { code: 'PLATFORM_ADMIN_FEATURE_NOT_CONFIGURED' } });
  });

  it('denies all platform-admin data endpoints to a normal organization owner', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/clients', headers: { cookie: regularCookie } });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'PLATFORM_ADMIN_ACCESS_DENIED' } });
    expect(JSON.stringify(response.json())).not.toContain('Real PostgreSQL Client');
  });
});
