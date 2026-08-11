import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';
import { aiProviderRegistry } from '../src/modules/ai/ai-provider.registry.js';
import type { AiReviewIntelligenceProvider } from '../src/modules/ai/ai-provider.types.js';
import { enqueueAiReplyGeneration, processAiReplyGenerationJob } from '../src/modules/ai/reply-copilot.service.js';
import { processReplyPublishJob, processReplyReconciliationJob } from '../src/modules/reviews/review-publishing.service.js';
import { providerRegistry } from '../src/modules/integrations/providers/provider.registry.js';
import type { ProviderAdapter, ProviderReplyResult, ProviderReplyReconciliationResult } from '../src/modules/integrations/providers/provider.types.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P19 integration tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('P19 AI Reply Copilot', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sessionToken = `p19-${randomUUID()}`;
  const otherSessionToken = `p19-other-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const otherCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(otherSessionToken)}`;
  const providerId = `p19-provider-${randomUUID()}`.toLowerCase();
  const aiProviderId = `p19-ai-${randomUUID()}`.toLowerCase();
  let businessId = '';
  let sourceId = '';
  let integrationAccountId = '';
  let publishMode: 'confirmed' | 'unknown' = 'confirmed';

  const publishReply = vi.fn(async (): Promise<ProviderReplyResult> => {
    if (publishMode === 'unknown') return { status: 'UNKNOWN' };
    return { status: 'CONFIRMED', externalReplyId: 'provider-reply-1', providerState: 'PUBLISHED' };
  });
  const reconcileReply = vi.fn(async (): Promise<ProviderReplyReconciliationResult> => ({
    status: 'CONFIRMED', externalReplyId: 'provider-reply-reconciled', providerState: 'PUBLISHED',
  }));

  const provider: ProviderAdapter = {
    id: providerId,
    displayName: 'P19 Provider',
    capabilities: ['reviews.reply'],
    availability: () => ({ configured: true, connectable: true }),
    connect: vi.fn(async () => ({ verified: true as const, health: 'CONNECTED' as const })),
    publishReply,
    reconcileReply,
  };

  const aiProvider: AiReviewIntelligenceProvider = {
    id: aiProviderId,
    model: 'p19-fixture-model',
    promptVersion: 'review-intelligence.test.v1',
    availability: () => ({ configured: true, available: true }),
    healthCheck: async () => ({ configured: true, available: true }),
    analyzeReview: async () => { throw new Error('not used'); },
    generateReply: async (input) => ({
      provider: aiProviderId,
      model: 'p19-fixture-model',
      modelVersion: 'fixture-1',
      promptVersion: 'review-reply.test.v1',
      inputTokens: 24,
      outputTokens: 38,
      estimatedCostMicros: 3,
      output: {
        reply: input.rating === 1
          ? 'Спасибо за обратную связь. Нам жаль, что ваш опыт оказался негативным. Хотим внимательно разобраться в ситуации.'
          : 'Спасибо за отзыв! Рады, что вам понравилось. Будем рады видеть вас снова.',
        language: 'ru',
        tone: input.mode,
        confidence: 0.98,
        warnings: [],
      },
    }),
  };

  async function createReview(rating: number, suffix: string) {
    const review = await app.prisma.review.create({
      data: {
        organizationId,
        businessId,
        sourceId,
        externalId: `p19-${suffix}-${randomUUID()}`,
        rating,
        text: rating === 1 ? 'Очень плохой опыт.' : 'Всё отлично, спасибо!',
        language: 'ru',
        publishedAt: new Date('2026-08-10T10:00:00.000Z'),
        providerUpdatedAt: new Date('2026-08-10T10:00:00.000Z'),
        metadata: { provider: { raw: { providerReviewName: `accounts/a/locations/l/reviews/${suffix}` } } },
      },
    });
    await app.prisma.reviewInsight.create({
      data: {
        organizationId,
        reviewId: review.id,
        analysisVersion: 1,
        inputHash: `fixture-${suffix}`,
        sentiment: rating === 1 ? 'NEGATIVE' : 'POSITIVE',
        operationalUrgency: rating === 1 ? 80 : 5,
        reputationRisk: rating === 1 ? 75 : 5,
        churnRisk: null,
        churnRiskConfidence: null,
        churnRiskInsufficientEvidence: true,
        legalPrRisk: false,
        safetyRisk: false,
        signalReasons: [],
        observedFacts: [],
        inferences: [],
        recommendations: [],
        confidence: 0.95,
        provider: aiProviderId,
        model: 'fixture',
        promptVersion: 'p18-fixture',
      },
    });
    return review;
  }

  beforeAll(async () => {
    providerRegistry.register(provider);
    app = await buildApp();
    aiProviderRegistry.register(aiProvider, { active: true });

    const plan = await app.prisma.plan.create({
      data: { code: `P19_TEST_${organizationId.slice(0, 8)}`, name: 'P19 Test Plan', priceCents: 0 },
    });
    await app.prisma.entitlement.createMany({
      data: [
        { planId: plan.id, key: 'ai.review_intelligence', value: true },
        { planId: plan.id, key: 'ai.reply_copilot', value: true },
        { planId: plan.id, key: 'ai.autopilot', value: true },
      ],
    });
    await app.prisma.organization.createMany({
      data: [
        { id: organizationId, name: 'P19 Org', slug: `p19-${randomUUID()}` },
        { id: otherOrganizationId, name: 'P19 Other Org', slug: `p19-other-${randomUUID()}` },
      ],
    });
    await app.prisma.subscription.createMany({
      data: [
        { organizationId, planId: plan.id, status: 'ACTIVE' },
        { organizationId: otherOrganizationId, planId: plan.id, status: 'ACTIVE' },
      ],
    });
    await app.prisma.user.createMany({
      data: [
        { id: userId, phone: `+7${Date.now()}91`, displayName: 'P19 Owner', profileCompletedAt: new Date() },
        { id: otherUserId, phone: `+7${Date.now()}92`, displayName: 'P19 Other Owner', profileCompletedAt: new Date() },
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
        { userId, activeOrganizationId: organizationId, tokenHash: hashSessionToken(sessionToken), expiresAt: new Date(Date.now() + 20 * 60_000) },
        { userId: otherUserId, activeOrganizationId: otherOrganizationId, tokenHash: hashSessionToken(otherSessionToken), expiresAt: new Date(Date.now() + 20 * 60_000) },
      ],
    });
    const business = await app.prisma.business.create({ data: { organizationId, name: 'P19 Business', isPrimary: true, status: 'ACTIVE' } });
    businessId = business.id;
    const account = await app.prisma.integrationAccount.create({
      data: { organizationId, provider: providerId, name: 'P19 Provider', externalAccountId: 'account-a', status: 'CONNECTED' },
    });
    integrationAccountId = account.id;
    const source = await app.prisma.reviewSource.create({
      data: {
        organizationId,
        businessId,
        provider: providerId,
        name: 'P19 Source',
        externalAccountId: 'location-l',
        metadata: { integrationAccountId },
      },
    });
    sourceId = source.id;
  });

  afterAll(async () => {
    providerRegistry.unregister(providerId);
    const openAi = aiProviderRegistry.get('openai');
    if (openAi) aiProviderRegistry.register(openAi, { active: true });
    if (app) {
      const subscriptions = await app.prisma.subscription.findMany({ where: { organizationId: { in: [organizationId, otherOrganizationId] } }, select: { planId: true } });
      await app.prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
      await app.prisma.plan.deleteMany({ where: { id: { in: subscriptions.map((item) => item.planId) } } });
      await app.close();
    }
  });

  it('persists tenant Brand Voice and blocks cross-tenant access', async () => {
    const save = await app.inject({
      method: 'PUT',
      url: '/api/v1/ai/brand-voice',
      headers: { cookie },
      payload: { tone: 'PREMIUM', prohibitedPhrases: ['гарантируем возврат'] },
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().profile).toMatchObject({ tone: 'PREMIUM', prohibitedPhrases: ['гарантируем возврат'] });

    const other = await app.inject({ method: 'GET', url: '/api/v1/ai/brand-voice', headers: { cookie: otherCookie } });
    expect(other.statusCode).toBe(200);
    expect(other.json().profile.tone).toBe('PROFESSIONAL');
  });

  it('generates a structured AI draft and reuses the existing approval workflow', async () => {
    const review = await createReview(5, 'confirmed');
    const queued = await enqueueAiReplyGeneration(app.prisma, {
      organizationId,
      reviewId: review.id,
      actorUserId: userId,
      mode: 'EMPATHETIC',
      instructions: '',
    });
    await processAiReplyGenerationJob(app.prisma, {
      organizationId,
      reviewId: review.id,
      aiOperationId: queued.operationId,
      actorUserId: userId,
      mode: 'EMPATHETIC',
      instructions: '',
    });
    const operation = await app.prisma.aiOperation.findUniqueOrThrow({ where: { id: queued.operationId }, include: { reply: true } });
    expect(operation.status).toBe('SUCCEEDED');
    expect(operation.reply).toMatchObject({ origin: 'AI', status: 'DRAFT', generationMode: 'EMPATHETIC', policyDecision: 'ALLOW' });

    const submit = await app.inject({ method: 'POST', url: `/api/v1/reviews/${review.id}/replies/${operation.reply!.id}/submit`, headers: { cookie } });
    expect(submit.statusCode).toBe(200);
    expect(submit.json().reply.status).toBe('PENDING');
    const approve = await app.inject({ method: 'POST', url: `/api/v1/reviews/${review.id}/replies/${operation.reply!.id}/approve`, headers: { cookie } });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().reply.status).toBe('READY_TO_PUBLISH');
  });

  it('publishes only after a provider-confirmed side effect', async () => {
    publishMode = 'confirmed';
    publishReply.mockClear();
    const review = await createReview(5, 'publish-confirmed');
    const reply = await app.prisma.reviewReply.create({
      data: { organizationId, reviewId: review.id, authorUserId: userId, text: 'Спасибо за отзыв!', status: 'READY_TO_PUBLISH', version: 1 },
    });
    const enqueue = await app.inject({ method: 'POST', url: `/api/v1/reviews/${review.id}/replies/${reply.id}/publish`, headers: { cookie } });
    expect(enqueue.statusCode).toBe(202);
    expect(enqueue.json().status).toBe('PUBLISH_QUEUED');
    await processReplyPublishJob(app.prisma, { organizationId, reviewId: review.id, replyId: reply.id });
    expect(publishReply).toHaveBeenCalledTimes(1);
    await expect(app.prisma.reviewReply.findUniqueOrThrow({ where: { id: reply.id } })).resolves.toMatchObject({ status: 'PUBLISHED', providerReplyId: 'provider-reply-1' });
    await expect(app.prisma.review.findUniqueOrThrow({ where: { id: review.id } })).resolves.toMatchObject({ workflowStatus: 'PUBLISHED', status: 'DONE' });
  });

  it('uses UNKNOWN plus reconciliation after an ambiguous provider mutation', async () => {
    publishMode = 'unknown';
    publishReply.mockClear();
    reconcileReply.mockClear();
    const review = await createReview(5, 'publish-unknown');
    const reply = await app.prisma.reviewReply.create({
      data: { organizationId, reviewId: review.id, authorUserId: userId, text: 'Спасибо, ждём вас снова!', status: 'READY_TO_PUBLISH', version: 1 },
    });
    const queued = await app.inject({ method: 'POST', url: `/api/v1/reviews/${review.id}/replies/${reply.id}/publish`, headers: { cookie } });
    expect(queued.statusCode).toBe(202);
    await processReplyPublishJob(app.prisma, { organizationId, reviewId: review.id, replyId: reply.id });
    expect(publishReply).toHaveBeenCalledTimes(1);
    await expect(app.prisma.reviewReply.findUniqueOrThrow({ where: { id: reply.id } })).resolves.toMatchObject({ status: 'PUBLISH_UNKNOWN' });

    await processReplyReconciliationJob(app.prisma, { organizationId, reviewId: review.id, replyId: reply.id });
    expect(reconcileReply).toHaveBeenCalledTimes(1);
    expect(publishReply).toHaveBeenCalledTimes(1);
    await expect(app.prisma.reviewReply.findUniqueOrThrow({ where: { id: reply.id } })).resolves.toMatchObject({ status: 'PUBLISHED', providerReplyId: 'provider-reply-reconciled' });
  });

  it('never auto-publishes a one-star review even with Autopilot enabled', async () => {
    publishMode = 'confirmed';
    publishReply.mockClear();
    await app.prisma.replyAutopilotPolicy.upsert({
      where: { organizationId },
      create: { organizationId, enabled: true, minimumRating: 1, maximumReputationRisk: 100, minimumAiConfidence: 0 },
      update: { enabled: true, minimumRating: 1, maximumReputationRisk: 100, minimumAiConfidence: 0 },
    });
    const review = await createReview(1, 'one-star');
    const queued = await enqueueAiReplyGeneration(app.prisma, {
      organizationId,
      reviewId: review.id,
      actorUserId: userId,
      mode: 'RECOVERY_FOCUSED',
      instructions: '',
    });
    await processAiReplyGenerationJob(app.prisma, {
      organizationId,
      reviewId: review.id,
      aiOperationId: queued.operationId,
      actorUserId: userId,
      mode: 'RECOVERY_FOCUSED',
      instructions: '',
    });
    const operation = await app.prisma.aiOperation.findUniqueOrThrow({ where: { id: queued.operationId }, include: { reply: true } });
    expect(operation.reply).toMatchObject({ status: 'DRAFT', origin: 'AI', policyDecision: 'REQUIRE_APPROVAL' });
    expect(publishReply).not.toHaveBeenCalled();
  });
});
