import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';

const app = await buildApp();

const platformAdminId = randomUUID();
const regularUserId = randomUUID();
const organizationId = randomUUID();
const planCode = `admin-${randomUUID().slice(0, 8)}`;
const platformAdminIdentity = env.PLATFORM_ADMIN_IDENTITIES[1] || env.PLATFORM_ADMIN_IDENTITIES[0] || 'platform-data-admin@example.test';
const platformAdminSessionToken = `admin-platform-data-${randomUUID()}`;
const regularSessionToken = `regular-platform-data-${randomUUID()}`;
const platformAdminCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(platformAdminSessionToken)}`;
const regularCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(regularSessionToken)}`;

beforeAll(async () => {
  await app.prisma.user.createMany({
    data: [
      {
        id: platformAdminId,
        email: platformAdminIdentity,
        phone: `+7${Date.now()}71`,
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

describe('platform admin PostgreSQL data', () => {
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
