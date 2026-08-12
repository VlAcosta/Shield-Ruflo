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
  throw new Error('Billing boundary tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('Strategic billing purchase boundary', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const userId = randomUUID();
  const sessionToken = `billing-boundary-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();
    const free = await app.prisma.plan.findUnique({ where: { code: 'FREE' } });
    if (!free) throw new Error('FREE plan is required');

    await app.prisma.organization.create({
      data: { id: organizationId, name: 'Billing Boundary Org', slug: `billing-boundary-${randomUUID()}` },
    });
    await app.prisma.user.create({
      data: {
        id: userId,
        phone: `+7995${String(Date.now()).slice(-7)}`,
        email: `billing-${randomUUID()}@example.test`,
        displayName: 'Billing Owner',
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
      data: { organizationId, planId: free.id, status: 'ACTIVE', provider: null, autoRenew: false },
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('publishes an explicit no-provider purchase boundary', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/billing/purchase-options' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      onlineCheckout: { available: false, provider: null, reasonCode: 'PAYMENT_PROVIDER_NOT_CONFIGURED' },
      salesAssisted: { available: true, mode: 'SALES_ASSISTED', paymentCreated: false, subscriptionActivated: false },
    });
  });

  it('creates an idempotent annual GROWTH request from server pricing without activating a subscription', async () => {
    const idempotencyKey = `billing-test-${randomUUID()}`;
    const before = await app.prisma.subscription.findFirst({
      where: { organizationId, status: 'ACTIVE' },
      include: { plan: true },
    });
    expect(before?.plan.code).toBe('FREE');

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/checkout',
      headers: { cookie, 'idempotency-key': idempotencyKey },
      payload: {
        planId: 'GROWTH',
        billing: 'annual',
        amount: 1,
        currency: 'USD',
        returnUrl: 'https://example.test/pricing',
      },
    });

    expect(first.statusCode).toBe(202);
    const payload = first.json();
    expect(payload).toMatchObject({
      mode: 'SALES_ASSISTED',
      paymentCreated: false,
      subscriptionActivated: false,
      deduplicated: false,
      request: {
        planCode: 'GROWTH',
        billingInterval: 'annual',
        quotedAmountCents: 9169800,
        currency: 'RUB',
        status: 'OPEN',
      },
      nextAction: { type: 'SALES_CONTACT', status: 'REQUEST_RECORDED' },
    });
    expect(String(payload.nextAction.url)).toContain(`billingRequest=${payload.request.id}`);

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/checkout',
      headers: { cookie, 'idempotency-key': idempotencyKey },
      payload: { planId: 'GROWTH', billing: 'annual', amount: 999999999, currency: 'RUB' },
    });
    expect(second.statusCode).toBe(202);
    expect(second.json()).toMatchObject({ deduplicated: true, request: { id: payload.request.id, quotedAmountCents: 9169800 } });

    expect(await app.prisma.billingPurchaseRequest.count({ where: { organizationId } })).toBe(1);
    expect(await app.prisma.auditLog.count({
      where: { organizationId, action: 'billing.purchase_requested', entityId: payload.request.id },
    })).toBe(1);

    const after = await app.prisma.subscription.findFirst({
      where: { organizationId, status: 'ACTIVE' },
      include: { plan: true },
    });
    expect(after?.id).toBe(before?.id);
    expect(after?.plan.code).toBe('FREE');
  });

  it('lists only the current organization purchase requests', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/purchase-requests',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().requests).toHaveLength(1);
    const item = response.json().requests[0];
    expect(item).toMatchObject({ planCode: 'GROWTH' });
    expect(item).not.toHaveProperty('organizationId');
    expect(item).not.toHaveProperty('requestedByUserId');
  });

  it('requires a valid idempotency key for commercial mutations', async () => {
    const missing = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/checkout',
      headers: { cookie },
      payload: { planId: 'START', billing: 'monthly' },
    });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } });
  });
});
