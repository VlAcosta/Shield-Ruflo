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
  throw new Error('P6 integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('Dashboard P6 truthful tenant analytics', () => {
  let app: FastifyInstance;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const restrictedUserId = randomUUID();
  const sessionToken = `p6-dashboard-${randomUUID()}`;
  const restrictedSessionToken = `p6-dashboard-restricted-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const restrictedCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(restrictedSessionToken)}`;
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
    await app.prisma.user.createMany({
      data: [
        { id: userAId, phone: `+7${Date.now()}61`, displayName: 'P6 Owner A', profileCompletedAt: new Date() },
        { id: userBId, phone: `+7${Date.now()}62`, displayName: 'P6 Owner B', profileCompletedAt: new Date() },
        { id: restrictedUserId, phone: `+7${Date.now()}63`, displayName: 'P6 Restricted', profileCompletedAt: new Date() },
      ],
    });
    await app.prisma.organizationMember.createMany({
      data: [
        { organizationId: organizationAId, userId: userAId, role: 'OWNER', status: 'ACTIVE' },
        { organizationId: organizationBId, userId: userBId, role: 'OWNER', status: 'ACTIVE' },
        {
          organizationId: organizationAId,
          userId: restrictedUserId,
          role: 'MEMBER',
          status: 'ACTIVE',
          permissionOverrides: {
            deny: [
              'reviews.view',
              'analytics.view',
              'tasks.view',
              'reports.view',
              'team.view',
              'integrations.view',
            ],
          },
        },
      ],
    });
    await app.prisma.session.createMany({
      data: [
        {
          userId: userAId,
          activeOrganizationId: organizationAId,
          tokenHash: hashSessionToken(sessionToken),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
        {
          userId: restrictedUserId,
          activeOrganizationId: organizationAId,
          tokenHash: hashSessionToken(restrictedSessionToken),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
      ],
    });
    const businessA = await app.prisma.business.create({ data: { organizationId: organizationAId, name: 'P6 Business A', isPrimary: true } });
    const sourceA = await app.prisma.reviewSource.create({ data: { organizationId: organizationAId, businessId: businessA.id, provider: 'p6-a', name: 'P6 Source A' } });
    businessAId = businessA.id;
    sourceAId = sourceA.id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userAId, userBId, restrictedUserId] } } });
    await app.close();
  });

  it('returns explicit unmeasured state instead of fake KPI values when the tenant has no reviews', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard/overview', headers: { cookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      contractVersion: 2,
      timezone: 'Europe/Moscow',
      measured: false,
      metrics: {
        reviews: { value: 0 },
        rating: { value: null, caption: 'Недостаточно данных' },
      },
      pulse: { measured: false, score: null, status: 'Недостаточно данных', signals: [] },
      reputation: { totalReviews: 0, averageRating: null, positiveShare: 0, negativeShare: 0, responseCoverage: 0 },
      reviews: { week: { total: 0 }, month: { total: 0 } },
      rating: { week: { reviews: 0 }, month: { reviews: 0 } },
      reports: { week: [], month: [] },
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
      contractVersion: 2,
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
      reviews: {
        week: { total: 2 },
        month: { total: 2 },
      },
      tasks: {
        week: expect.any(Array),
        month: expect.any(Array),
      },
    });
    expect(response.json().reviews.week.answered.reduce((sum: number, value: number) => sum + value, 0)).toBe(1);
    expect(JSON.stringify(response.json())).not.toContain('p6-private');
    expect(response.json().reputation.sourceDistribution).toHaveLength(1);
    expect(response.json().reputation.sourceDistribution[0]).toMatchObject({ sourceId: sourceAId, count: 2 });

    const reputation = await app.inject({ method: 'GET', url: '/api/v1/dashboard/reputation', headers: { cookie } });
    expect(reputation.statusCode).toBe(200);
    expect(reputation.json().reputation.totalReviews).toBe(2);
  });

  it('does not return permission-scoped sections to a dashboard-only membership', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/dashboard/overview', headers: { cookie: restrictedCookie } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      contractVersion: 2,
      metrics: { tasks: null },
      reputation: {},
      reviews: {},
      rating: {},
      tasks: {},
      processes: [],
      reports: {},
      team: [],
      integrations: [],
      dataAvailability: {
        reviews: false,
        analytics: false,
        tasks: false,
        reports: false,
        team: false,
        integrations: false,
      },
    });
    expect(response.json().pulse.measured).toBe(true);
  });

  it('queues reports in the existing worker job system and persists tenant schedules', async () => {
    const periodEnd = new Date();
    const periodStart = new Date(periodEnd.getTime() - 7 * 86_400_000);
    const generate = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/generate',
      headers: { cookie },
      payload: {
        type: 'weekly_reputation',
        title: 'P6 Weekly Reputation',
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        requestedBlocks: ['rating', 'reviews'],
      },
    });
    expect(generate.statusCode).toBe(202);
    const reportId = generate.json().report.id as string;
    expect(generate.json().report.status).toBe('QUEUED');

    const job = await app.prisma.job.findFirst({
      where: { organizationId: organizationAId, type: 'report.generate' },
      orderBy: { createdAt: 'desc' },
    });
    expect(job).not.toBeNull();
    expect(job?.payload).toMatchObject({ reportId });

    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/reports/generate',
      headers: { cookie },
      payload: {
        type: 'weekly_reputation',
        title: 'P6 Weekly Reputation duplicate title',
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      },
    });
    expect(duplicate.statusCode).toBe(202);
    expect(duplicate.json().report.id).toBe(reportId);

    const list = await app.inject({ method: 'GET', url: '/api/v1/reports', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json().reports.some((item: { id: string }) => item.id === reportId)).toBe(true);

    const detail = await app.inject({ method: 'GET', url: `/api/v1/reports/${reportId}`, headers: { cookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().report.id).toBe(reportId);

    const schedules = [
      {
        id: 'p6-weekly-email',
        title: 'Еженедельный отчёт',
        day: 'mon',
        dayLabel: 'Пн',
        time: '09:00',
        channel: 'email',
        channelLabel: 'Email',
        enabled: true,
      },
    ];
    const saveSchedules = await app.inject({
      method: 'PUT',
      url: '/api/v1/reports/schedules',
      headers: { cookie },
      payload: { schedules },
    });
    expect(saveSchedules.statusCode).toBe(200);
    expect(saveSchedules.json().schedules).toEqual(schedules);

    const afterSchedules = await app.inject({ method: 'GET', url: '/api/v1/reports', headers: { cookie } });
    expect(afterSchedules.json().schedules).toEqual(schedules);
  });
});
