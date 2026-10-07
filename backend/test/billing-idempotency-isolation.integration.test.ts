import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { AppError } from '../src/core/errors/app-error.js';
import { createSalesAssistedPurchaseRequest } from '../src/modules/billing/billing.purchase.service.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|p1|p26|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Billing idempotency tests require NODE_ENV=test and a matching test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('billing purchase idempotency isolation', () => {
  let app: FastifyInstance;
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (!app) return;
    if (organizationIds.length) {
      await app.prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    }
    if (userIds.length) {
      await app.prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app.close();
  });

  async function principal(label: string) {
    const organization = await app.prisma.organization.create({
      data: { name: `Billing ${label}`, slug: `billing-${label.toLowerCase()}-${randomUUID()}` },
    });
    const user = await app.prisma.user.create({
      data: { phone: `+78${String(Date.now()).slice(-8)}${organizationIds.length}`, displayName: `Billing ${label}` },
    });
    organizationIds.push(organization.id);
    userIds.push(user.id);
    return { organizationId: organization.id, userId: user.id };
  }

  it('never returns another tenant purchase request for a concurrent reused key', async () => {
    const first = await principal('Alpha');
    const second = await principal('Beta');
    const idempotencyKey = `billing-cross-tenant-${randomUUID()}`;

    const results = await Promise.allSettled([
      createSalesAssistedPurchaseRequest(app, {
        ...first,
        planCode: 'START',
        billingInterval: 'monthly',
        idempotencyKey,
      }),
      createSalesAssistedPurchaseRequest(app, {
        ...second,
        planCode: 'START',
        billingInterval: 'monthly',
        idempotencyKey,
      }),
    ]);

    const fulfilled = results.filter((item): item is PromiseFulfilledResult<Awaited<ReturnType<typeof createSalesAssistedPurchaseRequest>>> => item.status === 'fulfilled');
    const rejected = results.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBeInstanceOf(AppError);
    expect((rejected[0]?.reason as AppError).code).toBe('IDEMPOTENCY_KEY_CONFLICT');

    const stored = await app.prisma.billingPurchaseRequest.findUniqueOrThrow({ where: { idempotencyKey } });
    expect(stored.organizationId).toBe(fulfilled[0]!.value.request.id === stored.id ? stored.organizationId : stored.organizationId);
    expect([first.organizationId, second.organizationId]).toContain(stored.organizationId);
  });

  it('rejects a reused key when the commercial payload changes', async () => {
    const principalA = await principal('Payload');
    const idempotencyKey = `billing-payload-${randomUUID()}`;

    await createSalesAssistedPurchaseRequest(app, {
      ...principalA,
      planCode: 'START',
      billingInterval: 'monthly',
      idempotencyKey,
    });

    await expect(createSalesAssistedPurchaseRequest(app, {
      ...principalA,
      planCode: 'PRO',
      billingInterval: 'annual',
      idempotencyKey,
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_CONFLICT', statusCode: 409 });
  });
});
