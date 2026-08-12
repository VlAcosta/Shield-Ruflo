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
  throw new Error('Premium entitlement tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

type Workspace = {
  organizationId: string;
  userId: string;
  cookie: string;
};

describeWithPostgres('Strategic premium feature entitlements', () => {
  let app: FastifyInstance;
  const workspaces: Workspace[] = [];

  async function createWorkspace(planCode: 'START' | 'GROWTH' | 'PRO' | 'BUSINESS'): Promise<Workspace> {
    const organizationId = randomUUID();
    const userId = randomUUID();
    const sessionToken = `premium-${planCode.toLowerCase()}-${randomUUID()}`;
    const plan = await app.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) throw new Error(`${planCode} plan migration is required`);

    await app.prisma.organization.create({
      data: { id: organizationId, name: `${planCode} Workspace`, slug: `premium-${planCode.toLowerCase()}-${randomUUID()}` },
    });
    await app.prisma.user.create({
      data: {
        id: userId,
        phone: `+79${String(Math.floor(Math.random() * 1_000_000_000)).padStart(9, '0')}`,
        displayName: `${planCode} Owner`,
        profileCompletedAt: new Date(),
      },
    });
    await app.prisma.organizationMember.create({
      data: { organizationId, userId, role: 'OWNER', status: 'ACTIVE' },
    });
    await app.prisma.session.create({
      data: {
        userId,
        activeOrganizationId: organizationId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 30 * 60_000),
      },
    });
    await app.prisma.subscription.create({
      data: { organizationId, planId: plan.id, status: 'ACTIVE', autoRenew: false },
    });

    const workspace = {
      organizationId,
      userId,
      cookie: `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`,
    };
    workspaces.push(workspace);
    return workspace;
  }

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (!app) return;
    const organizationIds = workspaces.map((item) => item.organizationId);
    const userIds = workspaces.map((item) => item.userId);
    if (organizationIds.length) await app.prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    if (userIds.length) await app.prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('blocks Competitive Intelligence on START but allows it on GROWTH', async () => {
    const start = await createWorkspace('START');
    const growth = await createWorkspace('GROWTH');

    const blocked = await app.inject({ method: 'GET', url: '/api/v1/competitive/competitors', headers: { cookie: start.cookie } });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({
      error: { code: 'ENTITLEMENT_REQUIRED', details: { entitlement: 'competitive', plan: 'START' } },
    });

    const allowed = await app.inject({ method: 'GET', url: '/api/v1/competitive/competitors', headers: { cookie: growth.cookie } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({ competitors: [] });
  });

  it('blocks AI Visibility on GROWTH but allows it on PRO', async () => {
    const growth = await createWorkspace('GROWTH');
    const pro = await createWorkspace('PRO');

    const blocked = await app.inject({ method: 'GET', url: '/api/v1/ai-visibility/probes', headers: { cookie: growth.cookie } });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({
      error: { code: 'ENTITLEMENT_REQUIRED', details: { entitlement: 'aiVisibility', plan: 'GROWTH' } },
    });

    const allowed = await app.inject({ method: 'GET', url: '/api/v1/ai-visibility/probes', headers: { cookie: pro.cookie } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({ probes: [] });
  });

  it('reserves agency management for BUSINESS', async () => {
    const pro = await createWorkspace('PRO');
    const business = await createWorkspace('BUSINESS');

    const blocked = await app.inject({ method: 'GET', url: '/api/v1/agency/portfolio', headers: { cookie: pro.cookie } });
    expect(blocked.statusCode).toBe(403);
    expect(blocked.json()).toMatchObject({
      error: { code: 'ENTITLEMENT_REQUIRED', details: { entitlement: 'agency', plan: 'PRO' } },
    });

    const allowed = await app.inject({ method: 'GET', url: '/api/v1/agency/portfolio', headers: { cookie: business.cookie } });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({ clients: [] });
  });

  it('does not commercially lock client-side agency acceptance/revocation safety routes', async () => {
    const start = await createWorkspace('START');
    const invalidToken = 'x'.repeat(48);

    const acceptance = await app.inject({
      method: 'POST',
      url: `/api/v1/agency/invitations/${invalidToken}/accept`,
      headers: { cookie: start.cookie },
    });

    expect(acceptance.statusCode).not.toBe(403);
    expect(acceptance.json().error?.code).not.toBe('ENTITLEMENT_REQUIRED');
  });
});
