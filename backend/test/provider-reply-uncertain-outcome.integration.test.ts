import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { ProviderAdapterError } from '../src/modules/integrations/providers/provider.errors.js';
import { providerRegistry } from '../src/modules/integrations/providers/provider.registry.js';
import type { ProviderAdapter } from '../src/modules/integrations/providers/provider.types.js';
import {
  processReplyPublishJob,
  processReplyReconciliationJob,
} from '../src/modules/reviews/review-publishing.service.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|p1|p26|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Provider reply recovery tests require NODE_ENV=test and a matching test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('provider reply uncertain outcome recovery', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const userId = randomUUID();
  const providerId = `reply-recovery-${randomUUID()}`.toLowerCase();
  const publishReply = vi.fn();
  const reconcileReply = vi.fn();

  const adapter: ProviderAdapter = {
    id: providerId,
    displayName: 'Reply recovery provider',
    capabilities: ['reviews.reply'],
    availability: () => ({ configured: true, connectable: true }),
    connect: async () => ({ verified: true, health: 'CONNECTED' }),
    publishReply,
    reconcileReply,
  };

  beforeAll(async () => {
    providerRegistry.register(adapter);
    app = await buildApp();
    await app.prisma.organization.create({
      data: { id: organizationId, name: 'Reply Recovery Org', slug: `reply-recovery-${randomUUID()}` },
    });
    await app.prisma.user.create({
      data: { id: userId, phone: `+73${String(Date.now()).slice(-8)}1`, displayName: 'Reply Recovery Owner' },
    });
  });

  afterAll(async () => {
    providerRegistry.unregister(providerId);
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('never republishes after a retryable publish timeout and reconciles until confirmed', async () => {
    publishReply.mockRejectedValueOnce(new ProviderAdapterError({
      code: 'PROVIDER_TIMEOUT_AFTER_SEND',
      message: 'Provider timed out after request dispatch',
      retryable: true,
      statusCode: 504,
    }));
    reconcileReply
      .mockResolvedValueOnce({ status: 'ABSENT', providerState: 'NOT_VISIBLE_YET' })
      .mockResolvedValueOnce({
        status: 'CONFIRMED',
        externalReplyId: 'provider-reply-123',
        providerState: 'VISIBLE',
      });

    const business = await app.prisma.business.create({
      data: { organizationId, name: 'Recovery Business', status: 'ACTIVE', isPrimary: true },
    });
    const account = await app.prisma.integrationAccount.create({
      data: {
        organizationId,
        provider: providerId,
        name: 'Recovery provider account',
        status: 'CONNECTED',
      },
    });
    const source = await app.prisma.reviewSource.create({
      data: {
        organizationId,
        businessId: business.id,
        provider: providerId,
        name: 'Recovery source',
        metadata: { integrationAccountId: account.id },
      },
    });
    const reviewReference = `provider-review-${randomUUID()}`;
    const review = await app.prisma.review.create({
      data: {
        organizationId,
        businessId: business.id,
        sourceId: source.id,
        externalId: `review-${randomUUID()}`,
        rating: 5,
        text: 'Great service',
        metadata: {
          provider: {
            raw: { providerReviewName: reviewReference },
          },
        },
      },
    });
    const reply = await app.prisma.reviewReply.create({
      data: {
        organizationId,
        reviewId: review.id,
        authorUserId: userId,
        text: 'Спасибо за ваш отзыв!',
        status: 'PUBLISH_QUEUED',
        version: 1,
        publishRequestedAt: new Date(),
      },
    });

    await expect(processReplyPublishJob(app.prisma, {
      organizationId,
      reviewId: review.id,
      replyId: reply.id,
    })).resolves.toBeUndefined();

    expect(publishReply).toHaveBeenCalledTimes(1);
    expect(publishReply).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId, accountId: account.id }),
      { reviewReference, text: reply.text },
    );

    const afterPublish = await app.prisma.reviewReply.findUniqueOrThrow({ where: { id: reply.id } });
    expect(afterPublish.status).toBe('PUBLISH_UNKNOWN');
    expect(afterPublish.failedReason).toBe('PROVIDER_TIMEOUT_AFTER_SEND');
    expect(afterPublish.retryCount).toBe(1);

    const reconciliationJobs = await app.prisma.job.findMany({
      where: {
        organizationId,
        type: 'provider.reconcileReply',
        payload: { path: ['replyId'], equals: reply.id },
      },
    });
    expect(reconciliationJobs).toHaveLength(1);
    expect(reconciliationJobs[0]?.status).toBe('QUEUED');

    let firstReconciliationError: unknown;
    try {
      await processReplyReconciliationJob(app.prisma, {
        organizationId,
        reviewId: review.id,
        replyId: reply.id,
      });
    } catch (error) {
      firstReconciliationError = error;
    }
    expect(firstReconciliationError).toMatchObject({
      code: 'PROVIDER_REPLY_NOT_FOUND_YET',
      retryable: true,
    });
    expect(publishReply).toHaveBeenCalledTimes(1);
    expect(reconcileReply).toHaveBeenCalledTimes(1);

    const stillUnknown = await app.prisma.reviewReply.findUniqueOrThrow({ where: { id: reply.id } });
    expect(stillUnknown.status).toBe('PUBLISH_UNKNOWN');
    expect(stillUnknown.failedReason).toBe('PROVIDER_REPLY_NOT_FOUND_YET');
    expect(stillUnknown.lastReconciledAt).not.toBeNull();

    await expect(processReplyReconciliationJob(app.prisma, {
      organizationId,
      reviewId: review.id,
      replyId: reply.id,
    })).resolves.toBeUndefined();

    expect(publishReply).toHaveBeenCalledTimes(1);
    expect(reconcileReply).toHaveBeenCalledTimes(2);

    const published = await app.prisma.reviewReply.findUniqueOrThrow({ where: { id: reply.id } });
    expect(published.status).toBe('PUBLISHED');
    expect(published.providerReplyId).toBe('provider-reply-123');
    expect(published.providerState).toBe('VISIBLE');
    expect(published.failedReason).toBeNull();

    const storedReview = await app.prisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(storedReview.status).toBe('DONE');
    expect(storedReview.workflowStatus).toBe('PUBLISHED');
    expect(storedReview.repliedAt).not.toBeNull();
  });
});
