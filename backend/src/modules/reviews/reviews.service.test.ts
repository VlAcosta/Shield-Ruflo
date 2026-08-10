import { describe, expect, it, vi } from 'vitest';
import { getReview, listReviews, replyToReview, seedReview, updateReview, updateSource } from './reviews.service.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const reviewId = '00000000-0000-4000-8000-000000000002';
const userId = '00000000-0000-4000-8000-000000000003';

function persistedReview() {
  const now = new Date('2026-08-09T00:00:00.000Z');
  return {
    id: reviewId,
    organizationId,
    externalId: 'external-review-1',
    sourceId: '00000000-0000-4000-8000-000000000004',
    sourceUrl: null,
    businessId: '00000000-0000-4000-8000-000000000005',
    business: { id: '00000000-0000-4000-8000-000000000005', name: 'Business' },
    locationId: null,
    location: null,
    source: { provider: 'manual', name: 'Ручной импорт' },
    author: { name: 'Клиент' },
    rating: 5,
    title: null,
    text: 'Хороший сервис',
    status: 'DEFERRED',
    workflowStatus: 'DRAFT',
    repliedAt: null,
    publishedAt: now,
    receivedAt: now,
    updatedAt: now,
    metadata: null,
    tags: [],
    assignments: [],
    replies: [{ id: 'reply-1', text: 'Спасибо', status: 'DRAFT', publishedAt: null }],
  };
}

function request() {
  return {
    auth: { organizationId, userId },
    ip: '127.0.0.1',
    headers: {},
  } as never;
}

describe('truthful review reply workflow', () => {
  it('persists an omitted/false publish request only as a draft', async () => {
    const replyCreate = vi.fn().mockResolvedValue({ id: 'reply-1' });
    const reviewUpdate = vi.fn().mockResolvedValue({ id: reviewId });
    const auditCreate = vi.fn().mockResolvedValue({ id: 'audit-1' });
    const app = {
      prisma: {
        review: { findFirst: vi.fn().mockResolvedValue(persistedReview()) },
        $transaction: async (work: (tx: unknown) => Promise<void>) => work({
          reviewReply: { create: replyCreate },
          review: { update: reviewUpdate },
          auditLog: { create: auditCreate },
        }),
      },
    } as never;

    const result = await replyToReview(app, request(), reviewId, { text: 'Спасибо', publish: false });

    expect(result.ok).toBe(true);
    expect(replyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ status: 'DRAFT', text: 'Спасибо' }),
    });
    expect(replyCreate.mock.calls[0]?.[0].data).not.toHaveProperty('publishedAt');
    expect(reviewUpdate).toHaveBeenCalledWith({
      where: { id: reviewId },
      data: { status: 'DEFERRED', workflowStatus: 'DRAFT' },
    });
    expect(auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: 'review.reply.drafted' }),
    });
  });

  it('rejects provider publication when no provider publisher is configured', async () => {
    const transaction = vi.fn();
    const app = {
      prisma: {
        review: { findFirst: vi.fn().mockResolvedValue(persistedReview()) },
        $transaction: transaction,
      },
    } as never;

    await expect(replyToReview(app, request(), reviewId, { text: 'Спасибо', publish: true }))
      .rejects.toMatchObject({ code: 'REVIEW_PUBLISH_NOT_AVAILABLE', statusCode: 422 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a direct client transition to published', async () => {
    const transaction = vi.fn();
    const app = {
      prisma: {
        review: { findFirst: vi.fn().mockResolvedValue(persistedReview()) },
        $transaction: transaction,
      },
    } as never;

    await expect(updateReview(app, request(), reviewId, { workflowStatus: 'published' }))
      .rejects.toMatchObject({ code: 'REVIEW_PUBLISH_NOT_AVAILABLE', statusCode: 422 });
    expect(transaction).not.toHaveBeenCalled();
  });
});

describe('review source location ownership', () => {
  it('rejects moving a source to a location owned by another business', async () => {
    const sourceUpdate = vi.fn();
    const app = {
      prisma: {
        reviewSource: {
          findFirst: vi.fn().mockResolvedValue({ id: 'source-1', businessId: 'business-1' }),
          update: sourceUpdate,
        },
        location: {
          findFirst: vi.fn().mockResolvedValue({ id: 'location-2', business: { id: 'business-2' } }),
        },
      },
    } as never;

    await expect(updateSource(app, request(), 'source-1', { locationId: 'location-2' }))
      .rejects.toMatchObject({ code: 'LOCATION_NOT_FOUND', statusCode: 404 });
    expect(sourceUpdate).not.toHaveBeenCalled();
  });

  it('rejects importing a review with a location owned by another business', async () => {
    const reviewUpsert = vi.fn();
    const app = {
      prisma: {
        reviewSource: {
          findFirst: vi.fn().mockResolvedValue({ id: 'source-1', businessId: 'business-1' }),
        },
        location: {
          findFirst: vi.fn().mockResolvedValue({ id: 'location-2', business: { id: 'business-2' } }),
        },
        review: { upsert: reviewUpsert },
      },
    } as never;

    await expect(seedReview(app, request(), {
      sourceId: 'source-1',
      businessId: 'business-1',
      locationId: 'location-2',
      externalId: 'external-1',
      rating: 5,
      text: 'Отзыв',
    })).rejects.toMatchObject({ code: 'LOCATION_NOT_FOUND', statusCode: 404 });
    expect(reviewUpsert).not.toHaveBeenCalled();
  });
});

describe('organization tenant isolation', () => {
  it('always scopes inbox count and rows to the authenticated organization', async () => {
    const count = vi.fn().mockResolvedValue(0);
    const findMany = vi.fn().mockResolvedValue([]);
    const app = {
      prisma: {
        review: { count, findMany },
        $transaction: async (operations: Array<Promise<unknown>>) => Promise.all(operations),
      },
    } as never;

    await listReviews(app, request(), { page: 1, pageSize: 30, sort: 'receivedAt', order: 'desc' });

    expect(count).toHaveBeenCalledWith({ where: { organizationId } });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { organizationId } }));
  });

  it('returns the same 404 for a foreign-organization review and performs no reply write', async () => {
    const transaction = vi.fn();
    const app = {
      prisma: {
        review: { findFirst: vi.fn().mockResolvedValue(null) },
        $transaction: transaction,
      },
    } as never;

    await expect(getReview(app, organizationId, reviewId))
      .rejects.toMatchObject({ code: 'REVIEW_NOT_FOUND', statusCode: 404 });
    await expect(replyToReview(app, request(), reviewId, { text: 'Не должно сохраниться', publish: false }))
      .rejects.toMatchObject({ code: 'REVIEW_NOT_FOUND', statusCode: 404 });
    expect(transaction).not.toHaveBeenCalled();
  });
});
