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
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Entitlement enforcement tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

async function expectDatabasePlanLimit(operation: Promise<unknown>) {
  await expect(operation).rejects.toThrow(/PLAN_LIMIT_REACHED/);
}

describeWithPostgres('Strategic plan hard-cap enforcement', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const ownerId = randomUUID();
  const extraUserIds: string[] = [];
  const sessionToken = `strategy-limit-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  let businessId = '';

  beforeAll(async () => {
    app = await buildApp();
    const plan = await app.prisma.plan.findUnique({ where: { code: 'START' } });
    if (!plan) throw new Error('START plan migration is required for entitlement enforcement tests');

    await app.prisma.organization.create({
      data: { id: organizationId, name: 'Strategy Limit Org', slug: `strategy-limit-${randomUUID()}` },
    });
    await app.prisma.user.create({
      data: { id: ownerId, phone: `+7998${String(Date.now()).slice(-7)}`, displayName: 'Strategy Owner', profileCompletedAt: new Date() },
    });
    await app.prisma.organizationMember.create({
      data: { organizationId, userId: ownerId, role: 'OWNER', status: 'ACTIVE' },
    });
    await app.prisma.session.create({
      data: {
        userId: ownerId,
        activeOrganizationId: organizationId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    await app.prisma.subscription.create({
      data: { organizationId, planId: plan.id, status: 'ACTIVE', autoRenew: false },
    });
    const business = await app.prisma.business.create({
      data: { organizationId, name: 'Primary Business', status: 'ACTIVE', isPrimary: true },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.user.deleteMany({ where: { id: { in: [ownerId, ...extraUserIds] } } });
    await app.close();
  });

  it('returns a product-level 409 when a second START location is created', async () => {
    await app.prisma.location.create({ data: { businessId, name: 'Allowed Location', status: 'ACTIVE', isPrimary: true } });

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/businesses/${businessId}/locations`,
      headers: { cookie },
      payload: { name: 'Blocked Location' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: 'PLAN_LIMIT_REACHED',
        details: { entitlement: 'locations.max', limit: 1, upgradeRequired: true },
      },
    });
    expect(await app.prisma.location.count({ where: { businessId, status: 'ACTIVE' } })).toBe(1);
  });

  it('enforces the START review-source cap in the database', async () => {
    for (let index = 0; index < 5; index += 1) {
      await app.prisma.reviewSource.create({
        data: {
          organizationId,
          businessId,
          provider: `test-${index}`,
          name: `Source ${index + 1}`,
          status: 'ACTIVE',
        },
      });
    }

    await expectDatabasePlanLimit(app.prisma.reviewSource.create({
      data: { organizationId, businessId, provider: 'test-over', name: 'Source Over', status: 'ACTIVE' },
    }));
  });

  it('enforces the START active-user cap when access is activated', async () => {
    const secondUserId = randomUUID();
    const thirdUserId = randomUUID();
    extraUserIds.push(secondUserId, thirdUserId);
    await app.prisma.user.create({ data: { id: secondUserId, phone: `+7997${String(Date.now()).slice(-7)}` } });
    await app.prisma.user.create({ data: { id: thirdUserId, phone: `+7996${String(Date.now()).slice(-7)}` } });
    await app.prisma.organizationMember.create({
      data: { organizationId, userId: secondUserId, role: 'MEMBER', status: 'ACTIVE' },
    });

    await expectDatabasePlanLimit(app.prisma.organizationMember.create({
      data: { organizationId, userId: thirdUserId, role: 'MEMBER', status: 'ACTIVE' },
    }));
  });

  it('enforces enabled automation rules but does not count disabled drafts', async () => {
    for (let index = 0; index < 3; index += 1) {
      await app.prisma.automation.create({
        data: {
          organizationId,
          name: `Automation ${index + 1}`,
          trigger: 'review.created',
          conditions: {},
          actions: [],
          enabled: true,
        },
      });
    }

    await app.prisma.automation.create({
      data: { organizationId, name: 'Disabled draft', trigger: 'review.created', conditions: {}, actions: [], enabled: false },
    });
    await expectDatabasePlanLimit(app.prisma.automation.create({
      data: { organizationId, name: 'Automation Over', trigger: 'review.created', conditions: {}, actions: [], enabled: true },
    }));
  });

  it('enforces zero active competitors on START while allowing non-active records', async () => {
    await app.prisma.competitiveCompetitor.create({
      data: { organizationId, name: 'Paused competitor', status: 'PAUSED', createdByUserId: ownerId },
    });
    await expectDatabasePlanLimit(app.prisma.competitiveCompetitor.create({
      data: { organizationId, name: 'Blocked competitor', status: 'ACTIVE', createdByUserId: ownerId },
    }));
  });
});
