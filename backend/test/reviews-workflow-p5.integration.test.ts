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
  throw new Error('P5 integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('Reviews P5 reply approval workflow', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const userId = randomUUID();
  const reviewId = randomUUID();
  const sessionToken = `p5-workflow-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.create({
      data: { id: organizationId, name: 'P5 Workflow Organization', slug: `p5-workflow-${randomUUID()}` },
    });
    await app.prisma.user.create({
      data: { id: userId, phone: `+7${Date.now()}51`, displayName: 'P5 Owner', profileCompletedAt: new Date() },
    });
    await app.prisma.organizationMember.create({
      data: { organizationId, userId, role: 'OWNER', status: 'ACTIVE' },
    });
    const business = await app.prisma.business.create({
      data: { organizationId, name: 'P5 Business', isPrimary: true },
    });
    const source = await app.prisma.reviewSource.create({
      data: { organizationId, businessId: business.id, provider: 'p5-test', name: 'P5 Source' },
    });
    await app.prisma.review.create({
      data: {
        id: reviewId,
        organizationId,
        businessId: business.id,
        sourceId: source.id,
        externalId: `p5-review-${randomUUID()}`,
        rating: 2,
        text: 'P5 approval workflow review',
      },
    });
    await app.prisma.session.create({
      data: {
        userId,
        activeOrganizationId: organizationId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('enforces latest-version approval and never fakes provider publication', async () => {
    const firstDraft = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${reviewId}/reply`,
      headers: { cookie },
      payload: { text: 'Draft version one', publish: false },
    });
    expect(firstDraft.statusCode).toBe(200);
    expect(firstDraft.json().reply).toMatchObject({ status: 'DRAFT', version: 1 });
    const firstReplyId = firstDraft.json().reply.id as string;

    const secondDraft = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${reviewId}/reply`,
      headers: { cookie },
      payload: { text: 'Draft version two', publish: false },
    });
    expect(secondDraft.statusCode).toBe(200);
    expect(secondDraft.json().reply).toMatchObject({ status: 'DRAFT', version: 2 });
    const secondReplyId = secondDraft.json().reply.id as string;

    const staleSubmit = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${reviewId}/replies/${firstReplyId}/submit`,
      headers: { cookie },
    });
    expect(staleSubmit.statusCode).toBe(409);
    expect(staleSubmit.json()).toMatchObject({ error: { code: 'REVIEW_REPLY_STALE_VERSION' } });

    const submit = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${reviewId}/replies/${secondReplyId}/submit`,
      headers: { cookie },
    });
    expect(submit.statusCode).toBe(200);
    expect(submit.json()).toMatchObject({
      reply: { id: secondReplyId, status: 'PENDING', version: 2 },
      review: { workflowStatus: 'awaiting_approval' },
    });

    const approve = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${reviewId}/replies/${secondReplyId}/approve`,
      headers: { cookie },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toMatchObject({
      reply: { id: secondReplyId, status: 'READY_TO_PUBLISH', version: 2 },
      review: { workflowStatus: 'approved' },
    });

    const publish = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${reviewId}/replies/${secondReplyId}/publish`,
      headers: { cookie },
    });
    expect(publish.statusCode).toBe(422);
    expect(publish.json()).toMatchObject({ error: { code: 'REVIEW_PROVIDER_ACCOUNT_MISSING' } });

    await expect(app.prisma.reviewReply.findUniqueOrThrow({ where: { id: secondReplyId } }))
      .resolves.toMatchObject({ status: 'READY_TO_PUBLISH', publishedAt: null, providerReplyId: null });
    await expect(app.prisma.review.findUniqueOrThrow({ where: { id: reviewId } }))
      .resolves.toMatchObject({ workflowStatus: 'APPROVED' });

    const actions = await app.prisma.auditLog.findMany({
      where: { organizationId, entityId: secondReplyId },
      select: { action: true },
    });
    expect(actions.map((item) => item.action)).toEqual(expect.arrayContaining([
      'review.reply.submitted_for_approval',
      'review.reply.approved',
    ]));
  });

  it('supports explicit rejection without mutating an older approved version', async () => {
    const draft = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${reviewId}/reply`,
      headers: { cookie },
      payload: { text: 'Draft version three for rejection', publish: false },
    });
    expect(draft.statusCode).toBe(200);
    const replyId = draft.json().reply.id as string;
    expect(draft.json().reply).toMatchObject({ status: 'DRAFT', version: 3 });

    const submit = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${reviewId}/replies/${replyId}/submit`,
      headers: { cookie },
    });
    expect(submit.statusCode).toBe(200);

    const reject = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${reviewId}/replies/${replyId}/reject`,
      headers: { cookie },
      payload: { reason: 'Нужно изменить тональность ответа' },
    });
    expect(reject.statusCode).toBe(200);
    expect(reject.json()).toMatchObject({
      reply: { id: replyId, status: 'REJECTED', failedReason: 'Нужно изменить тональность ответа' },
      review: { workflowStatus: 'rejected' },
    });

    const history = await app.inject({
      method: 'GET',
      url: `/api/v1/reviews/${reviewId}/replies`,
      headers: { cookie },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().items.map((item: { version: number }) => item.version)).toEqual([3, 2, 1]);
  });
});
