import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';
import { provisionTestPlan } from './support/plan-fixtures.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P6 integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('Dashboard P6 truthful tenant analytics', () => {
  let app: FastifyInstance;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const sessionToken = `p6-dashboard-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  let businessAId = '';
  let sourceAId = '';

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'P6 Organization A', slug: `p6-a-${randomUUID()}`, timezone: 'Europe/Moscow' },
        { id: organizationBId, name: 'P6 Organization B', slug: `p6-b-${randomUUID()}`, timezone: 'Europe/Moscow' },
      ],
    });
    await provisionTestPlan(app, [organizationAId, organizationBId], 'PRO');
    await app.prisma.user.createMany({
      data: [
        { id: userAId, phone: `+7${Date.now()}61`, displayName: 'P6 Owner A', profileCompletedAt: new Date() },
        { id: userBId, phone: `+7${Date.now()}62`, displayName: 'P6 Owner B', profileCompletedAt: new Date() },
      ],
    });
    await app.prisma.organizationMember.createMany({
      data: [
        { organizationId: organizationAId, userId: userAId, role: 'OWNER', status: 'ACTIVE' },
        { organizationId: organizationBId, userId: userBId, role: 'OWNER', status: 'ACTIVE' },
      ],
    });
    await app.prisma.session.create({
      data: {
        userId: userAId,
        activeOrganizationId: organizationAId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
    const businessA = await app.prisma.business.create({ data: { organizationId: organizationAId, name: 'P6 Business A', isPrimary: true } });
    const sourceA = await app.prisma.reviewSource.create({ data: { organizationId: organizationAId, businessId: businessA.id, provider: 'p6-a', name: 'P6 Source A' } });
    businessAId = businessA.id;
    sourceAId = sourceA.id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await app.close();
  });

  it('returns explicit unmeasured state instead of fake KPI values when the tenant has no reviews', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard/overview', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      timezone: 'Europe/Moscow',
      measured: false,
      metrics: {
        reviews: { value: 0 },
        rating: { value: null, caption: 'Недостаточно данных' },
      },
      pulse: { measured: false, score: null, status: 'Недостаточно данных', signals: [] },
      reputation: { totalReviews: 0, averageRating: null, positiveShare: 0, negativeShare: 0, responseCoverage: 0 },
    });
  });

  it('calculates only current-tenant reviews, published replies and tasks', async () => {
    const reviewOneId = randomUUID();
    const reviewTwoId = randomUUID();
    await app.prisma.review.createMany({
      data: [
        {
          id: reviewOneId,
          organizationId: organizationAId,
          businessId: businessAId,
          sourceId: sourceAId,
          externalId: `p6-a-1-${randomUUID()}`,
          rating: 5,
          text: 'Excellent current tenant review',
          receivedAt: new Date(),
        },
        {
          id: reviewTwoId,
          organizationId: organizationAId,
          businessId: businessAId,
          sourceId: sourceAId,
          externalId: `p6-a-2-${randomUUID()}`,
          rating: 1,
          text: 'Negative current tenant review',
          receivedAt: new Date(),
        },
      ],
    });
    await app.prisma.reviewReply.create({
      data: {
        organizationId: organizationAId,
        reviewId: reviewOneId,
        authorUserId: userAId,
        text: 'Provider-confirmed answer',
        status: 'PUBLISHED',
        version: 1,
        providerReplyId: `provider-${randomUUID()}`,
        publishedAt: new Date(),
      },
    });
    await app.prisma.task.create({
      data: {
        organizationId: organizationAId,
        createdByUserId: userAId,
        title: 'Current tenant reputation task',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        deadline: new Date(Date.now() - 60_000),
      },
    });

    const businessB = await app.prisma.business.create({ data: { organizationId: organizationBId, name: 'P6 Business B', isPrimary: true } });
    const sourceB = await app.prisma.reviewSource.create({ data: { organizationId: organizationBId, businessId: businessB.id, provider: 'p6-b', name: 'P6 Source B' } });
    await app.prisma.review.create({
      data: {
        organizationId: organizationBId,
        businessId: businessB.id,
        sourceId: sourceB.id,
        externalId: `p6-private-${randomUUID()}`,
        rating: 4,
        text: 'Foreign tenant review must never affect A',
        receivedAt: new Date(),
      },
    });

    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard/overview', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      measured: true,
      metrics: {
        reviews: { value: 2 },
        rating: { value: 3 },
        tasks: { value: 1, caption: '1 просрочено' },
        shield: { active: true },
      },
      reputation: {
        totalReviews: 2,
        averageRating: 3,
        positiveShare: 50,
        negativeShare: 50,
        answered: 1,
        unanswered: 1,
        responseCoverage: 50,
        activeSources: 1,
      },
    });
    expect(JSON.stringify(response.json())).not.toContain('p6-private');
    expect(response.json().reputation.sourceDistribution).toHaveLength(1);
    expect(response.json().reputation.sourceDistribution[0]).toMatchObject({ sourceId: sourceAId, count: 2 });

    const reputation = await app.inject({ method: 'GET', url: '/api/v1/dashboard/reputation', headers: { cookie } });
    expect(reputation.statusCode).toBe(200);
    expect(reputation.json().reputation.totalReviews).toBe(2);
  });
});
