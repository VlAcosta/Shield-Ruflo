import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { syncWebhookDeliveryJobFailure } from '../src/modules/webhooks/webhook-delivery.service.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|p1|p26|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Webhook stale-job tests require NODE_ENV=test and a matching test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('webhook delivery stale job protection', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const userId = randomUUID();

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.create({
      data: { id: organizationId, name: 'Webhook retry org', slug: `webhook-retry-${randomUUID()}` },
    });
    await app.prisma.user.create({
      data: { id: userId, phone: `+76${String(Date.now()).slice(-8)}1`, displayName: 'Webhook Owner' },
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('does not let an old failed job overwrite a newer manual retry', async () => {
    const endpoint = await app.prisma.webhookEndpoint.create({
      data: {
        organizationId,
        name: 'Test endpoint',
        url: 'https://example.test/webhook',
        events: ['REVIEW_CREATED'],
        secretEncrypted: 'encrypted-placeholder',
        secretHint: 'placeholder',
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
        payload: { id: eventId },
        requestBody: JSON.stringify({ id: eventId }),
        status: 'QUEUED',
        nextAttemptAt: new Date(),
      },
    });
    const oldJob = await app.prisma.job.create({
      data: {
        organizationId,
        type: 'webhook.deliver',
        payload: { deliveryId: delivery.id, endpointId: endpoint.id },
        status: 'DEAD',
        dedupeKey: `webhook-old-${randomUUID()}`,
        completedAt: new Date(),
      },
    });
    await app.prisma.job.create({
      data: {
        organizationId,
        type: 'webhook.deliver',
        payload: { deliveryId: delivery.id, endpointId: endpoint.id },
        status: 'QUEUED',
        dedupeKey: `webhook-retry-${randomUUID()}`,
      },
    });

    await syncWebhookDeliveryJobFailure(app.prisma, {
      deliveryId: delivery.id,
      jobId: oldJob.id,
      retryable: true,
      exhausted: true,
      nextRunAt: null,
      error: 'OLD_JOB_EXHAUSTED',
    });

    const stored = await app.prisma.webhookDelivery.findUniqueOrThrow({ where: { id: delivery.id } });
    expect(stored.status).toBe('QUEUED');
    expect(stored.deadAt).toBeNull();
    expect(stored.lastError).toBeNull();
  });
});
