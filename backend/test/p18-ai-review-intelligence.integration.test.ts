import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';
import { aiProviderRegistry } from '../src/modules/ai/ai-provider.registry.js';
import type { AiReviewIntelligenceProvider } from '../src/modules/ai/ai-provider.types.js';
import { enqueueReviewAnalysis, processReviewAnalysisJob } from '../src/modules/ai/review-intelligence.service.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P18 integration tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('P18 Shield AI Review Intelligence', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sessionToken = `p18-${randomUUID()}`;
  const otherSessionToken = `p18-other-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const otherCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(otherSessionToken)}`;
  let reviewId = '';
  let businessId = '';
  let sourceId = '';

  const provider: AiReviewIntelligenceProvider = {
    id: 'p18-test-ai',
    model: 'fixture-model',
    promptVersion: 'review-intelligence.test.v1',
    availability: () => ({ configured: true, available: true }),
    healthCheck: async () => ({ configured: true, available: true }),
    analyzeReview: async () => ({
      provider: 'p18-test-ai',
      model: 'fixture-model',
      modelVersion: 'fixture-1',
      promptVersion: 'review-intelligence.test.v1',
      inputTokens: 30,
      outputTokens: 50,
      estimatedCostMicros: 2,
      moderationResult: { piiRedactions: { email: 0, phone: 0 } },
      output: {
        sentiment: 'NEGATIVE',
        aspects: [{ aspect: 'speed', sentiment: 'NEGATIVE', confidence: 0.97, evidence: 'Ждали 40 минут' }],
        operationalUrgency: 77,
        reputationRisk: 68,
        churnRisk: null,
        churnRiskConfidence: null,
        churnRiskInsufficientEvidence: true,
        legalPrRisk: false,
        legalPrRiskReason: null,
        safetyRisk: false,
        safetyRiskReason: null,
        spamSignalProbability: 0.04,
        coordinatedSignalProbability: 0.01,
        signalReasons: [],
        rootCauseHypothesis: 'Возможна перегрузка смены',
        observedFacts: ['Клиент сообщил об ожидании 40 минут'],
        inferences: ['Возможна перегрузка смены'],
        recommendations: ['Проверить нагрузку и staffing'],
        confidence: 0.93,
      },
    }),
  };

  beforeAll(async () => {
    app = await buildApp();
    aiProviderRegistry.register(provider, { active: true });

    const plan = await app.prisma.plan.upsert({
      where: { code: `P18_TEST_${organizationId.slice(0, 8)}` },
      create: { code: `P18_TEST_${organizationId.slice(0, 8)}`, name: 'P18 Test Plan', priceCents: 0 },
      update: {},
    });
    await app.prisma.entitlement.create({ data: { planId: plan.id, key: 'ai.review_intelligence', value: true } });
    await app.prisma.organization.createMany({
      data: [
        { id: organizationId, name: 'P18 Org', slug: `p18-${randomUUID()}` },
        { id: otherOrganizationId, name: 'P18 Other Org', slug: `p18-other-${randomUUID()}` },
      ],
    });
    await app.prisma.subscription.create({ data: { organizationId, planId: plan.id, status: 'ACTIVE' } });
    await app.prisma.subscription.create({ data: { organizationId: otherOrganizationId, planId: plan.id, status: 'ACTIVE' } });

    await app.prisma.user.createMany({
      data: [
        { id: userId, phone: `+7${Date.now()}18`, displayName: 'P18 Owner', profileCompletedAt: new Date() },
        { id: otherUserId, phone: `+7${Date.now()}19`, displayName: 'P18 Other Owner', profileCompletedAt: new Date() },
      ],
    });
    await app.prisma.organizationMember.createMany({
      data: [
        { organizationId, userId, role: 'OWNER', status: 'ACTIVE' },
        { organizationId: otherOrganizationId, userId: otherUserId, role: 'OWNER', status: 'ACTIVE' },
      ],
    });
    await app.prisma.session.createMany({
      data: [
        {
          userId,
          activeOrganizationId: organizationId,
          tokenHash: hashSessionToken(sessionToken),
          expiresAt: new Date(Date.now() + 20 * 60_000),
        },
        {
          userId: otherUserId,
          activeOrganizationId: otherOrganizationId,
          tokenHash: hashSessionToken(otherSessionToken),
          expiresAt: new Date(Date.now() + 20 * 60_000),
        },
      ],
    });
    const business = await app.prisma.business.create({ data: { organizationId, name: 'P18 Business', status: 'ACTIVE', isPrimary: true } });
    businessId = business.id;
    const source = await app.prisma.reviewSource.create({
      data: { organizationId, businessId: business.id, provider: 'fixture', name: 'Fixture', externalAccountId: `fixture-${randomUUID()}` },
    });
    sourceId = source.id;
    const review = await app.prisma.review.create({
      data: {
        organizationId,
        businessId: business.id,
        sourceId: source.id,
        externalId: `review-${randomUUID()}`,
        rating: 2,
        text: 'Ждали заказ 40 минут, это очень долго.',
        language: 'ru',
        publishedAt: new Date('2026-08-01T10:00:00.000Z'),
        providerUpdatedAt: new Date('2026-08-01T10:00:00.000Z'),
      },
    });
    reviewId = review.id;
  });

  afterAll(async () => {
    const openAi = aiProviderRegistry.get('openai');
    if (openAi) aiProviderRegistry.register(openAi, { active: true });
    if (app) {
      await app.prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
      await app.prisma.plan.deleteMany({ where: { code: { startsWith: 'P18_TEST_' } } });
      await app.close();
    }
  });

  it('queues, persists and exposes structured intelligence', async () => {
    const queued = await enqueueReviewAnalysis(app.prisma, { organizationId, reviewId });
    expect(queued.queued).toBe(true);
    if (!queued.queued) throw new Error('Expected P18 analysis to queue');
    await processReviewAnalysisJob(app.prisma, { organizationId, reviewId, aiOperationId: queued.operationId });

    const response = await app.inject({ method: 'GET', url: `/api/v1/reviews/${reviewId}/intelligence`, headers: { cookie } });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('AVAILABLE');
    expect(body.insight.sentiment).toBe('NEGATIVE');
    expect(body.insight.aspects[0].aspect).toBe('SPEED');
    expect(body.insight.reputationRisk).toBe(68);
  });

  it('does not duplicate unchanged automatic analysis', async () => {
    const result = await enqueueReviewAnalysis(app.prisma, { organizationId, reviewId });
    expect(result.queued).toBe(false);
    expect(result.reason).toBe('ALREADY_ANALYZED');
  });

  it('atomically collapses concurrent enqueue attempts', async () => {
    const concurrentReview = await app.prisma.review.create({
      data: {
        organizationId,
        businessId,
        sourceId,
        externalId: `concurrent-${randomUUID()}`,
        rating: 1,
        text: 'Очень долгое ожидание и плохой сервис.',
        language: 'ru',
        publishedAt: new Date('2026-08-03T10:00:00.000Z'),
        providerUpdatedAt: new Date('2026-08-03T10:00:00.000Z'),
      },
    });

    const results = await Promise.all([
      enqueueReviewAnalysis(app.prisma, { organizationId, reviewId: concurrentReview.id }),
      enqueueReviewAnalysis(app.prisma, { organizationId, reviewId: concurrentReview.id }),
    ]);
    expect(results.filter((result) => result.queued)).toHaveLength(1);
    expect(results.filter((result) => !result.queued && result.reason === 'ALREADY_QUEUED')).toHaveLength(1);
    expect(await app.prisma.aiOperation.count({ where: { organizationId, reviewId: concurrentReview.id } })).toBe(1);
    expect(await app.prisma.job.count({ where: { organizationId, type: 'ai.analyzeReview', dedupeKey: { startsWith: `ai:review:${concurrentReview.id}:` } } })).toBe(1);
  });

  it('prevents cross-tenant intelligence access', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/reviews/${reviewId}/intelligence`, headers: { cookie: otherCookie } });
    expect(response.statusCode).toBe(404);
  });

  it('creates a new analysis after meaningful review content changes', async () => {
    await app.prisma.review.update({
      where: { id: reviewId },
      data: { text: 'Ждали заказ 55 минут, ситуация ухудшилась.', providerUpdatedAt: new Date('2026-08-02T10:00:00.000Z') },
    });
    const queued = await enqueueReviewAnalysis(app.prisma, { organizationId, reviewId });
    expect(queued.queued).toBe(true);
  });
});
