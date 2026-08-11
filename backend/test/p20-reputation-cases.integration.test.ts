import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';
import { dispatchAutomationEvent } from '../src/modules/operations/automation-engine.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P20 integration tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('P20 Reputation Cases', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sessionToken = `p20-${randomUUID()}`;
  const otherSessionToken = `p20-other-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const otherCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(otherSessionToken)}`;
  let businessId = '';
  let locationId = '';
  let sourceId = '';
  let ownerMemberId = '';

  async function createNegativeReview(index: number, rating = 2) {
    const receivedAt = new Date(Date.now() - Math.max(0, 3 - index) * 60_000);
    const review = await app.prisma.review.create({
      data: {
        organizationId,
        businessId,
        locationId,
        sourceId,
        externalId: `p20-review-${index}-${randomUUID()}`,
        rating,
        text: `Клиент ${index}: очень долго ждали обслуживание`,
        receivedAt,
        publishedAt: receivedAt,
      },
    });
    await app.prisma.reviewInsight.create({
      data: {
        organizationId,
        reviewId: review.id,
        analysisVersion: 1,
        inputHash: `p20-${review.id}`,
        sentiment: 'NEGATIVE',
        operationalUrgency: rating === 1 ? 95 : 80,
        reputationRisk: rating === 1 ? 90 : 72,
        churnRisk: null,
        churnRiskConfidence: null,
        churnRiskInsufficientEvidence: true,
        legalPrRisk: false,
        safetyRisk: false,
        signalReasons: [],
        rootCauseHypothesis: 'Длительное ожидание обслуживания',
        observedFacts: ['Клиент сообщает о длительном ожидании'],
        inferences: [],
        recommendations: ['Проверить скорость обслуживания'],
        confidence: 0.94,
        provider: 'p20-fixture',
        model: 'fixture',
        promptVersion: 'p20-fixture-v1',
        aspects: {
          create: [{ aspect: 'service-speed', sentiment: 'NEGATIVE', confidence: 0.96, evidence: 'долго ждали' }],
        },
      },
    });
    return review;
  }

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.createMany({
      data: [
        { id: organizationId, name: 'P20 Org', slug: `p20-${randomUUID()}` },
        { id: otherOrganizationId, name: 'P20 Other Org', slug: `p20-other-${randomUUID()}` },
      ],
    });
    await app.prisma.user.createMany({
      data: [
        { id: userId, phone: `+7${Date.now()}31`, displayName: 'P20 Owner', profileCompletedAt: new Date() },
        { id: otherUserId, phone: `+7${Date.now()}32`, displayName: 'P20 Other Owner', profileCompletedAt: new Date() },
      ],
    });
    const member = await app.prisma.organizationMember.create({
      data: { organizationId, userId, role: 'OWNER', status: 'ACTIVE' },
    });
    ownerMemberId = member.id;
    await app.prisma.organizationMember.create({
      data: { organizationId: otherOrganizationId, userId: otherUserId, role: 'OWNER', status: 'ACTIVE' },
    });
    await app.prisma.session.createMany({
      data: [
        { userId, activeOrganizationId: organizationId, tokenHash: hashSessionToken(sessionToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
        { userId: otherUserId, activeOrganizationId: otherOrganizationId, tokenHash: hashSessionToken(otherSessionToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
      ],
    });
    const business = await app.prisma.business.create({ data: { organizationId, name: 'P20 Business', isPrimary: true, status: 'ACTIVE' } });
    businessId = business.id;
    const location = await app.prisma.location.create({ data: { businessId, name: 'P20 Tula', isPrimary: true, status: 'ACTIVE' } });
    locationId = location.id;
    const source = await app.prisma.reviewSource.create({
      data: { organizationId, businessId, locationId, provider: 'p20-fixture', name: 'P20 Source' },
    });
    sourceId = source.id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await app.close();
  });

  it('creates a case from a review, infers AI context and blocks cross-tenant access', async () => {
    const review = await createNegativeReview(1, 1);
    const created = await app.inject({
      method: 'POST',
      url: `/api/v1/reviews/${review.id}/case`,
      headers: { cookie },
      payload: { ownerMemberId, slaMinutes: 240 },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().case).toMatchObject({
      category: 'service-speed',
      severity: 'critical',
      status: 'new',
      ownerMemberId,
      slaMinutes: 240,
    });
    expect(created.json().case.reviews).toHaveLength(1);
    expect(created.json().case.locations).toHaveLength(1);
    expect(created.json().case.metricSnapshots.some((item: { phase: string }) => item.phase === 'baseline')).toBe(true);

    const caseId = created.json().case.id as string;
    const crossTenant = await app.inject({ method: 'GET', url: `/api/v1/cases/${caseId}`, headers: { cookie: otherCookie } });
    expect(crossTenant.statusCode).toBe(404);
    const otherList = await app.inject({ method: 'GET', url: '/api/v1/cases', headers: { cookie: otherCookie } });
    expect(otherList.statusCode).toBe(200);
    expect(otherList.json().items).toHaveLength(0);
  });

  it('enforces the state machine, resolution, verification and measured outcome', async () => {
    const review = await createNegativeReview(2, 2);
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      headers: { cookie },
      payload: {
        title: 'Скорость обслуживания',
        category: 'service-speed',
        severity: 'HIGH',
        ownerMemberId,
        reviewIds: [review.id],
        locationIds: [locationId],
        slaMinutes: 240,
      },
    });
    expect(create.statusCode).toBe(201);
    const caseId = create.json().case.id as string;

    const illegal = await app.inject({
      method: 'POST', url: `/api/v1/cases/${caseId}/transition`, headers: { cookie }, payload: { status: 'IN_PROGRESS' },
    });
    expect(illegal.statusCode).toBe(409);
    expect(illegal.json()).toMatchObject({ error: { code: 'REPUTATION_CASE_INVALID_TRANSITION' } });

    for (const status of ['TRIAGED', 'ASSIGNED', 'IN_PROGRESS'] as const) {
      const response = await app.inject({
        method: 'POST', url: `/api/v1/cases/${caseId}/transition`, headers: { cookie }, payload: { status },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().case.status).toBe(status.toLowerCase());
    }

    const missingResolution = await app.inject({
      method: 'POST', url: `/api/v1/cases/${caseId}/transition`, headers: { cookie }, payload: { status: 'RESOLVED' },
    });
    expect(missingResolution.statusCode).toBe(422);
    expect(missingResolution.json()).toMatchObject({ error: { code: 'REPUTATION_CASE_RESOLUTION_REQUIRED' } });

    const resolved = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/transition`,
      headers: { cookie },
      payload: { status: 'RESOLVED', resolution: 'Добавили второго сотрудника в часы пик и обновили регламент.' },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().case.status).toBe('resolved');

    const verified = await app.inject({ method: 'POST', url: `/api/v1/cases/${caseId}/verify`, headers: { cookie }, payload: { note: 'Проверено менеджером' } });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().case.status).toBe('verified');
    expect(verified.json().case.outcome).toMatchObject({ delta: expect.any(Object), measuredAt: expect.any(String) });
    expect(verified.json().case.metricSnapshots.map((item: { phase: string }) => item.phase)).toEqual(expect.arrayContaining(['baseline', 'resolution', 'verification']));

    const closed = await app.inject({ method: 'POST', url: `/api/v1/cases/${caseId}/close`, headers: { cookie }, payload: {} });
    expect(closed.statusCode).toBe(200);
    expect(closed.json().case.status).toBe('closed');

    const reopened = await app.inject({ method: 'POST', url: `/api/v1/cases/${caseId}/reopen`, headers: { cookie }, payload: { note: 'Проблема повторилась' } });
    expect(reopened.statusCode).toBe(200);
    expect(reopened.json().case).toMatchObject({ status: 'in_progress', resolvedAt: null, verifiedAt: null, closedAt: null });
    expect(reopened.json().case.reopenedAt).toEqual(expect.any(String));
  });

  it('creates Case-linked tasks and preserves the relation in the existing Task domain', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/cases',
      headers: { cookie },
      payload: { title: 'Операционная задача', category: 'service-speed', severity: 'MEDIUM', locationIds: [locationId] },
    });
    expect(create.statusCode).toBe(201);
    const caseId = create.json().case.id as string;
    const task = await app.inject({
      method: 'POST',
      url: `/api/v1/cases/${caseId}/tasks`,
      headers: { cookie },
      payload: { title: 'Проверить SLA точки', priority: 'high', assigneeMemberIds: [ownerMemberId] },
    });
    expect(task.statusCode).toBe(201);
    await expect(app.prisma.task.findUniqueOrThrow({ where: { id: task.json().task.id } })).resolves.toMatchObject({ caseId });
  });

  it('executes the V2 similar-review automation as Case -> Task -> Notification without duplicates', async () => {
    const reviews = [
      await createNegativeReview(10, 2),
      await createNegativeReview(11, 2),
      await createNegativeReview(12, 2),
    ];
    const automation = await app.prisma.automation.create({
      data: {
        organizationId,
        name: 'P20 repeated service-speed complaints',
        trigger: 'rating_at_most',
        conditions: { rating: 2, topic: 'service-speed', similarReviewsMin: 3, similarWindowDays: 7 },
        actions: [
          { type: 'create_case', config: { category: 'service-speed', severity: 'HIGH', slaMinutes: 240 } },
          { type: 'create_task', config: { title: 'Разобрать повторяющийся негатив' } },
          { type: 'assign_manager', config: {} },
          { type: 'notify', config: { title: 'Повторяющийся негатив по скорости сервиса' } },
        ],
        enabled: true,
      },
    });
    const target = reviews[2]!;
    const event = {
      type: 'new_review' as const,
      organizationId,
      actorUserId: userId,
      dedupeKey: `${sourceId}:${target.externalId}`,
      review: { id: target.id, rating: target.rating, businessId, locationId, provider: 'p20-fixture' },
    };
    const first = await dispatchAutomationEvent(app, event);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ automationId: automation.id, status: 'SUCCESS' });

    const caseRow = await app.prisma.reputationCase.findFirstOrThrow({
      where: { organizationId, sourceDedupeKey: `automation:${automation.id}:${event.dedupeKey}` },
    });
    expect(caseRow).toMatchObject({ origin: 'AUTOMATION', category: 'service-speed', severity: 'HIGH', ownerMemberId });
    await expect(app.prisma.task.findFirstOrThrow({ where: { organizationId, reviewId: target.id } })).resolves.toMatchObject({ caseId: caseRow.id });
    await expect(app.prisma.notification.findFirstOrThrow({ where: { organizationId, type: 'automation', payload: { path: ['caseId'], equals: caseRow.id } } })).resolves.toMatchObject({ status: 'UNREAD' });

    const second = await dispatchAutomationEvent(app, event);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ automationId: automation.id, deduplicated: true });
    expect(await app.prisma.reputationCase.count({ where: { organizationId, sourceDedupeKey: `automation:${automation.id}:${event.dedupeKey}` } })).toBe(1);
  });
});
