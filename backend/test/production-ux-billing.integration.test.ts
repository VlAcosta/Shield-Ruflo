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
  throw new Error('Production UX billing tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('Production UX billing recovery', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const userId = randomUUID();
  const sessionToken = `production-ux-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.create({
      data: { id: organizationId, name: 'Production UX Billing Org', slug: `production-ux-billing-${randomUUID()}` },
    });
    await app.prisma.user.create({
      data: {
        id: userId,
        phone: `+7999${String(Date.now()).slice(-7)}`,
        displayName: 'Production UX Owner',
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
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('creates a truthful FREE baseline and exposes the one-time PRO trial without fake checkout', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/billing', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      plan: { code: 'FREE' },
      paymentProviderConfigured: false,
      packages: [],
      payments: [],
      trial: { available: true, days: 14 },
    });

    const freeSubscription = await app.prisma.subscription.findFirst({ where: { organizationId }, include: { plan: true } });
    expect(freeSubscription?.plan.code).toBe('FREE');
    expect(freeSubscription?.status).toBe('ACTIVE');
  });

  it('activates PRO for fourteen days only once and never enables auto-renew', async () => {
    const activate = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/trial',
      headers: { cookie },
    });
    expect(activate.statusCode).toBe(200);
    const snapshot = activate.json();
    expect(snapshot).toMatchObject({
      plan: { code: 'PRO', autoRenew: false },
      subscription: { status: 'TRIALING', provider: 'internal_trial', autoRenew: false },
      trial: { available: false, days: 14 },
      paymentProviderConfigured: false,
    });

    const startsAt = new Date(snapshot.subscription.currentPeriodStart).getTime();
    const endsAt = new Date(snapshot.subscription.currentPeriodEnd).getTime();
    expect(endsAt - startsAt).toBe(14 * 24 * 60 * 60 * 1000);

    const retry = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/trial',
      headers: { cookie },
    });
    expect(retry.statusCode).toBe(409);
    expect(retry.json()).toMatchObject({ error: { code: 'PRO_TRIAL_ALREADY_USED' } });

    const proSubscriptions = await app.prisma.subscription.count({
      where: { organizationId, plan: { code: 'PRO' } },
    });
    expect(proSubscriptions).toBe(1);
  });
});
