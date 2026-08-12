import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import type { BillingProvider, CreateProviderPaymentInput, ProviderPayment } from '../src/modules/billing/providers/billing-provider.js';
import { setBillingProviderForTests } from '../src/modules/billing/providers/index.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe.sequential : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Billing checkout integration tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('Phase 2 billing checkout and provider reconciliation', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sessionToken = `billing-${randomUUID()}`;
  const otherSessionToken = `billing-other-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const otherCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(otherSessionToken)}`;
  const providerPayments = new Map<string, ProviderPayment>();
  let immediateSuccess = false;

  const createPayment = vi.fn(async (input: CreateProviderPaymentInput): Promise<ProviderPayment> => {
    const id = `test-${input.localPaymentId}`;
    const payment: ProviderPayment = {
      id,
      status: immediateSuccess ? 'succeeded' : 'pending',
      paid: immediateSuccess,
      amountCents: input.amountCents,
      currency: input.currency,
      confirmationUrl: immediateSuccess ? null : `https://checkout.example.test/${id}`,
      test: true,
      metadata: {
        local_payment_id: input.localPaymentId,
        organization_id: input.organizationId,
        ...input.metadata,
      },
    };
    providerPayments.set(id, payment);
    return payment;
  });

  const getPayment = vi.fn(async (providerPaymentId: string): Promise<ProviderPayment> => {
    const payment = providerPayments.get(providerPaymentId);
    if (!payment) throw new Error(`Unknown fake payment ${providerPaymentId}`);
    return payment;
  });

  const provider: BillingProvider = {
    id: 'yookassa',
    configured: true,
    createPayment,
    getPayment,
  };

  beforeAll(async () => {
    app = await buildApp();
    setBillingProviderForTests(provider);

    await app.prisma.organization.createMany({
      data: [
        { id: organizationId, name: 'Billing Organization', slug: `billing-${randomUUID()}` },
        { id: otherOrganizationId, name: 'Other Billing Organization', slug: `billing-other-${randomUUID()}` },
      ],
    });
    await app.prisma.user.createMany({
      data: [
        { id: userId, phone: `+7${Date.now()}51`, email: `billing-${randomUUID()}@example.test`, displayName: 'Billing Owner', profileCompletedAt: new Date() },
        { id: otherUserId, phone: `+7${Date.now()}52`, email: `billing-other-${randomUUID()}@example.test`, displayName: 'Other Billing Owner', profileCompletedAt: new Date() },
      ],
    });
    await app.prisma.organizationMember.createMany({
      data: [
        { organizationId, userId, role: 'OWNER', status: 'ACTIVE' },
        { organizationId: otherOrganizationId, userId: otherUserId, role: 'OWNER', status: 'ACTIVE' },
      ],
    });
    await app.prisma.session.createMany({
      data: [
        { userId, activeOrganizationId: organizationId, tokenHash: hashSessionToken(sessionToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
        { userId: otherUserId, activeOrganizationId: otherOrganizationId, tokenHash: hashSessionToken(otherSessionToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
      ],
    });
  });

  afterAll(async () => {
    setBillingProviderForTests(null);
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await app.close();
  });

  it('calculates constructor price only on the server', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/constructor/quote',
      headers: { cookie },
      payload: {
        businesses: 2,
        locations: 3,
        users: 3,
        modules: ['reviews', 'analytics', 'ai'],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      currency: 'RUB',
      amountCents: 634000,
      amount: 6340,
      entitlements: {
        maxBusinesses: 2,
        maxLocations: 3,
        maxUsers: 3,
        analytics: true,
        aiFeatures: true,
      },
    });
  });

  it('ignores a forged frontend total and keeps checkout idempotent', async () => {
    immediateSuccess = false;
    const key = `billing-plan-${randomUUID()}`;
    const payload = { kind: 'plan', planCode: 'PRO', total: 1, amountCents: 1 };

    const first = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/checkout',
      headers: { cookie, 'idempotency-key': key },
      payload,
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();
    expect(firstBody).toMatchObject({ status: 'pending', amountCents: 499000, currency: 'RUB', test: true });
    expect(firstBody.redirectUrl).toContain('https://checkout.example.test/');

    const created = createPayment.mock.calls.at(-1)?.[0];
    expect(created?.amountCents).toBe(499000);
    expect(created?.metadata.checkout_kind).toBe('plan');

    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/checkout',
      headers: { cookie, 'idempotency-key': key },
      payload,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().paymentId).toBe(firstBody.paymentId);
    expect(createPayment).toHaveBeenCalledTimes(1);
    expect(await app.prisma.payment.count({ where: { organizationId, idempotencyKey: key } })).toBe(1);

    const foreign = await app.inject({
      method: 'GET',
      url: `/api/v1/billing/payments/${firstBody.paymentId}`,
      headers: { cookie: otherCookie },
    });
    expect(foreign.statusCode).toBe(404);
  });

  it('activates PRO only after a verified provider status and deduplicates the webhook', async () => {
    const payment = await app.prisma.payment.findFirstOrThrow({
      where: { organizationId, checkoutKind: 'PLAN' },
      orderBy: { createdAt: 'desc' },
    });
    expect(payment.providerPaymentId).toBeTruthy();

    const pending = providerPayments.get(payment.providerPaymentId!);
    expect(pending).toBeTruthy();
    providerPayments.set(payment.providerPaymentId!, { ...pending!, status: 'succeeded', paid: true, confirmationUrl: null });

    const payload = {
      type: 'notification',
      event: 'payment.succeeded',
      object: { id: payment.providerPaymentId, status: 'succeeded' },
    };
    const first = await app.inject({ method: 'POST', url: '/api/v1/billing/webhooks/yookassa', payload });
    expect(first.statusCode).toBe(200);

    const stored = await app.prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(stored.status).toBe('SUCCEEDED');
    expect(stored.subscriptionId).toBeTruthy();

    const active = await app.prisma.subscription.findMany({
      where: { organizationId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE'] } },
      include: { plan: true },
    });
    expect(active).toHaveLength(1);
    expect(active[0]?.plan.code).toBe('PRO');

    const duplicate = await app.inject({ method: 'POST', url: '/api/v1/billing/webhooks/yookassa', payload });
    expect(duplicate.statusCode).toBe(200);
    expect(await app.prisma.subscription.count({ where: { organizationId, status: 'ACTIVE' } })).toBe(1);
    expect(await app.prisma.billingWebhookEvent.count({ where: { providerObjectId: payment.providerPaymentId! } })).toBe(1);
  });

  it('extends the current PRO period instead of replacing it', async () => {
    immediateSuccess = true;
    const before = await app.prisma.subscription.findFirstOrThrow({
      where: { organizationId, status: 'ACTIVE' },
      include: { plan: true },
    });
    expect(before.plan.code).toBe('PRO');
    expect(before.currentPeriodEnd).toBeTruthy();

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/checkout',
      headers: { cookie, 'idempotency-key': `billing-renew-${randomUUID()}` },
      payload: { kind: 'plan', planCode: 'PRO' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('succeeded');

    const after = await app.prisma.subscription.findMany({
      where: { organizationId, status: 'ACTIVE' },
      include: { plan: true },
    });
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(before.id);
    expect(after[0]?.plan.code).toBe('PRO');
    expect(after[0]?.currentPeriodEnd?.getTime()).toBe((before.currentPeriodEnd?.getTime() ?? 0) + 30 * 24 * 60 * 60 * 1000);
  });

  it('creates a tenant-owned hidden plan for a paid constructor configuration', async () => {
    immediateSuccess = true;
    const key = `billing-custom-${randomUUID()}`;
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/checkout',
      headers: { cookie, 'idempotency-key': key },
      payload: {
        kind: 'constructor',
        selection: {
          businesses: 1,
          locations: 4,
          users: 5,
          modules: ['reviews', 'analytics', 'automations'],
        },
        total: 1,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('succeeded');

    const active = await app.prisma.subscription.findFirstOrThrow({
      where: { organizationId, status: 'ACTIVE' },
      include: { plan: { include: { entitlements: true } } },
      orderBy: { createdAt: 'desc' },
    });
    expect(active.plan.code).toBe(`CUSTOM_${organizationId.replace(/-/g, '').toUpperCase()}`);
    expect(active.plan.organizationId).toBe(organizationId);
    expect(active.plan.active).toBe(false);
    const entitlements = Object.fromEntries(active.plan.entitlements.map((item) => [item.key, item.value]));
    expect(entitlements).toMatchObject({ maxLocations: 4, maxUsers: 5, analytics: true, automations: true, aiFeatures: false });

    const exposed = await app.inject({ method: 'GET', url: '/api/v1/billing/plans', headers: { cookie } });
    expect(exposed.statusCode).toBe(200);
    expect(exposed.json().plans.some((plan: { code: string }) => plan.code.startsWith('CUSTOM_'))).toBe(false);
  });
});
