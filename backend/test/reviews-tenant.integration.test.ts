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
  throw new Error('P0 integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('Reviews API PostgreSQL tenant isolation', () => {
  let app: FastifyInstance;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const reviewAId = randomUUID();
  const reviewBId = randomUUID();
  const sessionToken = `p0-integration-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();

    const organizationA = await app.prisma.organization.create({
      data: {
        id: organizationAId,
        name: 'P0 Integration Organization A',
        slug: `p0-integration-a-${randomUUID()}`,
      },
    });
    const organizationB = await app.prisma.organization.create({
      data: {
        id: organizationBId,
        name: 'P0 Integration Organization B',
        slug: `p0-integration-b-${randomUUID()}`,
      },
    });
    await app.prisma.user.createMany({
      data: [
        { id: userAId, phone: `+7${Date.now()}01`, displayName: 'P0 User A', profileCompletedAt: new Date() },
        { id: userBId, phone: `+7${Date.now()}02`, displayName: 'P0 User B', profileCompletedAt: new Date() },
      ],
    });
    await app.prisma.organizationMember.createMany({
      data: [
        { organizationId: organizationA.id, userId: userAId, role: 'OWNER', status: 'ACTIVE' },
        { organizationId: organizationB.id, userId: userBId, role: 'OWNER', status: 'ACTIVE' },
      ],
    });

    const businessA = await app.prisma.business.create({
      data: { organizationId: organizationA.id, name: 'Business A', isPrimary: true },
    });
    const businessB = await app.prisma.business.create({
      data: { organizationId: organizationB.id, name: 'Business B', isPrimary: true },
    });
    const sourceA = await app.prisma.reviewSource.create({
      data: { organizationId: organizationA.id, businessId: businessA.id, provider: 'integration-test', name: 'Source A' },
    });
    const sourceB = await app.prisma.reviewSource.create({
      data: { organizationId: organizationB.id, businessId: businessB.id, provider: 'integration-test', name: 'Source B' },
    });
    await app.prisma.review.createMany({
      data: [
        {
          id: reviewAId,
          organizationId: organizationA.id,
          businessId: businessA.id,
          sourceId: sourceA.id,
          externalId: `review-a-${randomUUID()}`,
          rating: 5,
          text: 'Organization A review',
        },
        {
          id: reviewBId,
          organizationId: organizationB.id,
          businessId: businessB.id,
          sourceId: sourceB.id,
          externalId: `review-b-${randomUUID()}`,
          rating: 1,
          text: 'Organization B private review',
        },
      ],
    });
    await app.prisma.session.create({
      data: {
        userId: userAId,
        activeOrganizationId: organizationA.id,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await app.close();
  });

  it('uses the authenticated session tenant for list, detail, and a persisted local draft', async () => {
    const unauthenticated = await app.inject({ method: 'GET', url: '/api/v1/reviews' });
    expect(unauthenticated.statusCode).toBe(401);

    const list = await app.inject({ method: 'GET', url: '/api/v1/reviews', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      items: [{ id: reviewAId, text: 'Organization A review' }],
      pagination: { total: 1 },
    });
    expect(JSON.stringify(list.json())).not.toContain(reviewBId);
    expect(JSON.stringify(list.json())).not.toContain('Organization B private review');

    const detail = await app.inject({ method: 'GET', url: `/api/v1/reviews/${reviewAId}`, headers: { cookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ review: { id: reviewAId, text: 'Organization A review' } });

    const draft = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${reviewAId}/reply`,
      headers: { cookie },
      payload: { text: 'Persisted Organization A draft', publish: false },
    });
    expect(draft.statusCode).toBe(200);
    expect(draft.json()).toMatchObject({
      ok: true,
      review: { id: reviewAId, reply: 'Persisted Organization A draft', replyStatus: 'draft' },
    });
    await expect(app.prisma.reviewReply.findFirstOrThrow({ where: { reviewId: reviewAId } }))
      .resolves.toMatchObject({ organizationId: organizationAId, status: 'DRAFT', text: 'Persisted Organization A draft' });
  });

  it('returns indistinguishable 404s and performs no writes for Organization B IDs', async () => {
    const before = await app.prisma.review.findUniqueOrThrow({ where: { id: reviewBId } });
    const replyCountBefore = await app.prisma.reviewReply.count({ where: { reviewId: reviewBId } });

    const detail = await app.inject({ method: 'GET', url: `/api/v1/reviews/${reviewBId}`, headers: { cookie } });
    expect(detail.statusCode).toBe(404);
    expect(detail.json()).toMatchObject({ error: { code: 'REVIEW_NOT_FOUND' } });

    const update = await app.inject({
      method: 'PATCH',
      url: `/api/v1/reviews/${reviewBId}`,
      headers: { cookie },
      payload: { status: 'done', tags: ['cross-tenant-write'] },
    });
    expect(update.statusCode).toBe(404);
    expect(update.json()).toMatchObject({ error: { code: 'REVIEW_NOT_FOUND' } });

    const reply = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${reviewBId}/reply`,
      headers: { cookie },
      payload: { text: 'Cross-tenant draft must not persist', publish: false },
    });
    expect(reply.statusCode).toBe(404);
    expect(reply.json()).toMatchObject({ error: { code: 'REVIEW_NOT_FOUND' } });

    const after = await app.prisma.review.findUniqueOrThrow({ where: { id: reviewBId } });
    expect(after).toMatchObject({ status: before.status, workflowStatus: before.workflowStatus, updatedAt: before.updatedAt });
    await expect(app.prisma.reviewReply.count({ where: { reviewId: reviewBId } })).resolves.toBe(replyCountBefore);
    await expect(app.prisma.reviewTagLink.count({ where: { reviewId: reviewBId } })).resolves.toBe(0);
  });
});
