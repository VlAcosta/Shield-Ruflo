import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const platformAdminIdentity = env.PLATFORM_ADMIN_IDENTITIES[1] ?? '';
const describeWithPostgres = integrationDatabaseUrl && isExplicitTestDatabase && platformAdminIdentity
  ? describe
  : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Platform admin integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('platform admin PostgreSQL data', () => {
  let app: FastifyInstance;
  const platformAdminId = randomUUID();
  const regularUserId = randomUUID();
  const organizationId = randomUUID();
  const planCode = `admin-${randomUUID().slice(0, 8)}`;
  const platformAdminSessionToken = `admin-platform-data-${randomUUID()}`;
  const regularSessionToken = `regular-platform-data-${randomUUID()}`;
  const platformAdminCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(platformAdminSessionToken)}`;
  const regularCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(regularSessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();

    const adminUsesEmail = platformAdminIdentity.includes('@');
    await app.prisma.user.createMany({
      data: [
        {
          id: platformAdminId,
          email: adminUsesEmail ? platformAdminIdentity : `platform-data-${randomUUID()}@example.test`,
          phone: adminUsesEmail ? `+7${Date.now()}71` : platformAdminIdentity,
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

    await app.prisma.session.createMany({
      data: [
        {
          userId: platformAdminId,
          tokenHash: hashSessionToken(platformAdminSessionToken),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
        {
          userId: regularUserId,
          tokenHash: hashSessionToken(regularSessionToken),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
      ],
    });

    await app.prisma.organization.create({
      data: {
        id: organizationId,
        slug: `real-postgresql-client-${organizationId.slice(0, 8)}`,
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
    await app.prisma.session.updateMany({
      where: { userId: regularUserId },
      data: { activeOrganizationId: organizationId },
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
        externalId: randomUUID(),
        rating: 5,
        text: 'Great service',
        receivedAt: new Date(),
        status: 'NEW',
        workflowStatus: 'INBOX',
      },
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.review.deleteMany({ where: { organizationId } });
    await app.prisma.reviewSource.deleteMany({ where: { organizationId } });
    await app.prisma.business.deleteMany({ where: { organizationId } });
    await app.prisma.subscription.deleteMany({ where: { organizationId } });
    await app.prisma.plan.deleteMany({ where: { code: planCode } });
    await app.prisma.organizationMember.deleteMany({ where: { organizationId } });
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.session.deleteMany({ where: { userId: { in: [platformAdminId, regularUserId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [platformAdminId, regularUserId] } } });
    await app.close();
  });

  test('platform admin can read real clients, subscriptions and analytics', async () => {
    const clients = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/clients',
      headers: { cookie: platformAdminCookie },
    });
    expect(clients.statusCode).toBe(200);
    expect(clients.json().clients).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: organizationId, name: 'ООО «Real PostgreSQL Client»' }),
    ]));

    const subscriptions = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/subscriptions',
      headers: { cookie: platformAdminCookie },
    });
    expect(subscriptions.statusCode).toBe(200);
    expect(subscriptions.json().subscriptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ clientId: organizationId }),
    ]));

    const analytics = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/analytics?period=month',
      headers: { cookie: platformAdminCookie },
    });
    expect(analytics.statusCode).toBe(200);
    expect(analytics.json()).toEqual(expect.objectContaining({ source: 'api' }));
  });

  test('client support messages appear in the platform queue and admin replies return to the client', async () => {
    const clientMessage = await app.inject({
      method: 'POST',
      url: '/api/v1/support/channels/technical/messages',
      headers: { cookie: regularCookie, 'idempotency-key': `admin-support-${randomUUID()}` },
      payload: { text: 'Нужна помощь с production интеграцией' },
    });
    expect(clientMessage.statusCode).toBe(201);
    const ticketId = clientMessage.json().ticket.id as string;

    const queue = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/tickets',
      headers: { cookie: platformAdminCookie },
    });
    expect(queue.statusCode).toBe(200);
    expect(queue.json()).toMatchObject({ configured: true, source: 'api' });
    expect(queue.json().tickets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: ticketId,
        clientId: organizationId,
        status: 'open',
        unread: 1,
      }),
    ]));

    const reply = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/tickets/${ticketId}/messages`,
      headers: { cookie: platformAdminCookie, 'idempotency-key': `admin-reply-${randomUUID()}` },
      payload: { text: 'Проверили обращение. Уже занимаемся проблемой.' },
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().ticket).toMatchObject({
      id: ticketId,
      status: 'in_progress',
      unread: 0,
    });

    const clientSnapshot = await app.inject({
      method: 'GET',
      url: '/api/v1/support',
      headers: { cookie: regularCookie },
    });
    expect(clientSnapshot.statusCode).toBe(200);
    expect(clientSnapshot.json().snapshot.threads.technical).toEqual(expect.arrayContaining([
      expect.objectContaining({ from: 'client', text: 'Нужна помощь с production интеграцией' }),
      expect.objectContaining({ from: 'support', text: 'Проверили обращение. Уже занимаемся проблемой.' }),
    ]));

    const close = await app.inject({
      method: 'PATCH',
      url: `/api/v1/admin/tickets/${ticketId}`,
      headers: { cookie: platformAdminCookie },
      payload: { status: 'closed', priority: 'high', unread: 0 },
    });
    expect(close.statusCode).toBe(200);
    expect(close.json().ticket).toMatchObject({
      id: ticketId,
      status: 'closed',
      priority: 'high',
    });

    const clientDetails = await app.inject({
      method: 'GET',
      url: `/api/v1/admin/clients/${organizationId}`,
      headers: { cookie: platformAdminCookie },
    });
    expect(clientDetails.statusCode).toBe(200);
    expect(clientDetails.json().supportConfigured).toBe(true);
    expect(clientDetails.json().tickets).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: ticketId }),
    ]));
  });

  test('regular authenticated users cannot read platform data', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/clients',
      headers: { cookie: regularCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  test('unconfigured admin modules fail truthfully instead of faking success', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/settings/smtp/test',
      headers: { cookie: platformAdminCookie },
    });
    expect(response.statusCode).toBe(501);
    expect(response.json().error.code).toBe('PLATFORM_ADMIN_FEATURE_NOT_CONFIGURED');
  });
});
