import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { processWebhookDeliveryJob } from '../src/modules/webhooks/webhook-delivery.service.js';
import { retryWebhookDelivery } from '../src/modules/webhooks/webhook.service.js';
import { encryptCredentialSecret } from '../src/shared/security/credential-cipher.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|p1|p26|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Webhook attempt persistence tests require NODE_ENV=test and a matching test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('webhook delivery attempt persistence', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const userId = randomUUID();

  beforeAll(async () => {
    app = await buildApp();
    const proPlan = await app.prisma.plan.findUniqueOrThrow({ where: { code: 'PRO' } });

    await app.prisma.organization.create({
      data: { id: organizationId, name: 'Webhook attempt org', slug: `webhook-attempt-${randomUUID()}` },
    });
    await app.prisma.user.create({
      data: { id: userId, phone: `+75${String(Date.now()).slice(-8)}1`, displayName: 'Webhook Owner' },
    });
    await app.prisma.subscription.create({
      data: {
        organizationId,
        planId: proPlan.id,
        status: 'ACTIVE',
        autoRenew: false,
      },
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('persists a successful delivery attempt under the advisory lock', async () => {
    const endpoint = await app.prisma.webhookEndpoint.create({
      data: {
        organizationId,
        name: 'Attempt endpoint',
        url: 'https://hooks.example.test/events',
        events: ['REVIEW_CREATED'],
        secretEncrypted: encryptCredentialSecret('whsec_test_delivery_attempt_secret'),
        secretHint: 'whsec_test…',
        createdByUserId: userId,
      },
    });
    const eventId = randomUUID();
    const delivery = await app.prisma.webhookDelivery.create({
      data: {
        organizationId,
        endpointId: endpoint.id,
        eventId,
        eventType: 'REVIEW_CREATED',
        payload: { eventId },
        requestBody: JSON.stringify({ eventId, type: 'review.created' }),
        status: 'QUEUED',
        nextAttemptAt: new Date(),
      },
    });

    const result = await processWebhookDeliveryJob(
      app.prisma,
      { deliveryId: delivery.id },
      {
        resolver: async (hostname) => {
          expect(hostname).toBe('hooks.example.test');
          return [{ address: '8.8.8.8', family: 4 }];
        },
        transport: async (input) => {
          expect(input.eventId).toBe(eventId);
          expect(input.eventType).toBe('review.created');
          expect(input.attempt).toBe(1);
          expect(input.signature).toMatch(/^v1=[a-f0-9]{64}$/);
          return { statusCode: 204, body: '', durationMs: 12 };
        },
      },
    );

    expect(result).toMatchObject({ deliveryId: delivery.id, delivered: true, attemptNumber: 1 });

    const stored = await app.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(stored.status).toBe('DELIVERED');
    expect(stored.attempts).toBe(1);
    expect(stored.responseStatus).toBe(204);
    expect(stored.deliveredAt).not.toBeNull();
    expect(stored.nextAttemptAt).toBeNull();

    const attempts = await app.prisma.webhookDeliveryAttempt.findMany({
      where: { deliveryId: delivery.id },
      orderBy: { attemptNumber: 'asc' },
    });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      attemptNumber: 1,
      outcome: 'DELIVERED',
      responseStatus: 204,
      durationMs: 12,
    });

    const storedEndpoint = await app.prisma.webhookEndpoint.findUniqueOrThrow({ where: { id: endpoint.id } });
    expect(storedEndpoint.lastDeliveryStatus).toBe('DELIVERED');
    expect(storedEndpoint.lastDeliveryAt).not.toBeNull();
  });

  it('requeues a dead delivery under the retry advisory lock', async () => {
    const endpoint = await app.prisma.webhookEndpoint.create({
      data: {
        organizationId,
        name: 'Retry endpoint',
        url: 'https://hooks.example.test/retry',
        events: ['REVIEW_CREATED'],
        secretEncrypted: encryptCredentialSecret('whsec_test_retry_secret'),
        secretHint: 'whsec_retry…',
        createdByUserId: userId,
      },
    });
    const delivery = await app.prisma.webhookDelivery.create({
      data: {
        organizationId,
        endpointId: endpoint.id,
        eventId: randomUUID(),
        eventType: 'REVIEW_CREATED',
        payload: { retry: true },
        requestBody: JSON.stringify({ retry: true }),
        status: 'DEAD',
        attempts: 3,
        deadAt: new Date(),
        lastError: 'WEBHOOK_HTTP_500',
      },
    });

    const request = {
      auth: {
        organizationId,
        userId,
        accessMode: 'DIRECT',
      },
      ip: '127.0.0.1',
      headers: { 'user-agent': 'vitest' },
    } as unknown as FastifyRequest;

    const result = await retryWebhookDelivery(app, request, delivery.id);
    expect(result.delivery).toMatchObject({
      id: delivery.id,
      status: 'queued',
      attempts: 3,
      lastError: null,
    });

    const stored = await app.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(stored.status).toBe('QUEUED');
    expect(stored.deadAt).toBeNull();
    expect(stored.nextAttemptAt).not.toBeNull();

    const jobs = await app.prisma.job.findMany({
      where: {
        organizationId,
        type: 'webhook.deliver',
        payload: { path: ['deliveryId'], equals: delivery.id },
      },
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.status).toBe('QUEUED');

    const audit = await app.prisma.auditLog.findFirst({
      where: {
        organizationId,
        action: 'webhook.delivery.retried',
        entityId: delivery.id,
      },
    });
    expect(audit).not.toBeNull();
  });

});
