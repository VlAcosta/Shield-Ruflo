import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { aiProviderRegistry } from '../src/modules/ai/ai-provider.registry.js';
import type { AiReviewIntelligenceProvider } from '../src/modules/ai/ai-provider.types.js';
import { processAskShieldJob } from '../src/modules/ask-shield/ask-shield.service.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe.sequential : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P25 integration tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('P25 Ask Shield', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sessionToken = `p25-${randomUUID()}`;
  const otherSessionToken = `p25-other-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const otherCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(otherSessionToken)}`;
  let previousProvider: AiReviewIntelligenceProvider | null = null;

  beforeAll(async () => {
    app = await buildApp();
    previousProvider = aiProviderRegistry.active();
    await app.prisma.organization.createMany({ data: [
      { id: organizationId, name: 'P25 Org', slug: `p25-${randomUUID()}` },
      { id: otherOrganizationId, name: 'P25 Other Org', slug: `p25-other-${randomUUID()}` },
    ] });
    await app.prisma.user.createMany({ data: [
      { id: userId, phone: `+7${Date.now()}81`, displayName: 'P25 Owner', profileCompletedAt: new Date() },
      { id: otherUserId, phone: `+7${Date.now()}82`, displayName: 'P25 Other', profileCompletedAt: new Date() },
    ] });
    await app.prisma.organizationMember.createMany({ data: [
      { organizationId, userId, role: 'OWNER', status: 'ACTIVE' },
      { organizationId: otherOrganizationId, userId: otherUserId, role: 'OWNER', status: 'ACTIVE' },
    ] });
    await app.prisma.session.createMany({ data: [
      { userId, activeOrganizationId: organizationId, tokenHash: hashSessionToken(sessionToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
      { userId: otherUserId, activeOrganizationId: otherOrganizationId, tokenHash: hashSessionToken(otherSessionToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
    ] });
    const business = await app.prisma.business.create({ data: { organizationId, name: 'P25 Coffee', isPrimary: true, status: 'ACTIVE' } });
    const source = await app.prisma.reviewSource.create({ data: { organizationId, businessId: business.id, provider: 'manual', name: 'P25 Source', status: 'ACTIVE' } });
    await app.prisma.review.create({
      data: {
        organizationId,
        businessId: business.id,
        sourceId: source.id,
        externalId: `p25-review-${randomUUID()}`,
        rating: 2,
        text: 'Очень долго ждал. Напишите мне на alex@example.com или +7 999 123-45-67.',
        receivedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    if (previousProvider) aiProviderRegistry.register(previousProvider, { active: true });
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await app.close();
  });

  const fakeProvider: AiReviewIntelligenceProvider = {
    id: 'p25-test-provider',
    model: 'p25-test-model',
    promptVersion: 'p25-test-review',
    availability: () => ({ configured: true, available: true }),
    healthCheck: async () => ({ configured: true, available: true }),
    analyzeReview: async () => { throw new Error('not used'); },
    answerShieldQuestion: async (input) => {
      const reviewEvidence = input.evidence.findIndex((item) => item.type === 'review');
      const summary = reviewEvidence >= 0 ? input.evidence[reviewEvidence]?.summary ?? '' : '';
      expect(summary).not.toContain('alex@example.com');
      expect(summary).not.toContain('+7 999 123-45-67');
      return {
        provider: 'p25-test-provider',
        model: 'p25-test-model',
        modelVersion: 'test-v1',
        promptVersion: 'p25-test-ask',
        inputTokens: 200,
        outputTokens: 80,
        estimatedCostMicros: 50,
        output: {
          answer: 'Негатив связан с ожиданием; проверьте операционный процесс и открытые задачи.',
          evidenceIndexes: [0, reviewEvidence, 9999, -1].filter((value) => value >= 0),
          confidence: 'MEDIUM',
          limitations: ['Выборка ограничена последними 30 днями.'],
        },
      };
    },
  };

  it('does not create a query when the active provider is unavailable', async () => {
    if (previousProvider) aiProviderRegistry.register(previousProvider, { active: true });
    const before = await app.prisma.askShieldQuery.count({ where: { organizationId } });
    const response = await app.inject({ method: 'POST', url: '/api/v1/ask-shield/queries', headers: { cookie }, payload: { question: 'Что требует внимания?' } });
    expect(response.statusCode).toBe(503);
    expect(await app.prisma.askShieldQuery.count({ where: { organizationId } })).toBe(before);
  });

  it('queues one durable read-only analysis and stores only valid supplied evidence', async () => {
    aiProviderRegistry.register(fakeProvider, { active: true });
    const beforeWrites = {
      tasks: await app.prisma.task.count({ where: { organizationId } }),
      cases: await app.prisma.reputationCase.count({ where: { organizationId } }),
      replies: await app.prisma.reviewReply.count({ where: { organizationId } }),
    };
    const queued = await app.inject({ method: 'POST', url: '/api/v1/ask-shield/queries', headers: { cookie }, payload: { question: 'Что сейчас требует внимания и почему?' } });
    expect(queued.statusCode).toBe(202);
    const queryId = queued.json().query.id as string;
    expect(await app.prisma.job.count({ where: { organizationId, type: 'askShield.answer', payload: { path: ['queryId'], equals: queryId } } })).toBe(1);

    await processAskShieldJob(app.prisma, { organizationId, queryId });
    const result = await app.prisma.askShieldQuery.findUniqueOrThrow({ where: { id: queryId } });
    expect(result).toMatchObject({ status: 'SUCCEEDED', provider: 'p25-test-provider', model: 'p25-test-model', promptVersion: 'p25-test-ask' });
    const evidence = result.evidence as Array<{ type: string; summary?: string | null }>;
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence.length).toBeLessThanOrEqual(2);
    expect(JSON.stringify(evidence)).not.toContain('alex@example.com');
    expect(JSON.stringify(evidence)).not.toContain('+7 999 123-45-67');

    expect({
      tasks: await app.prisma.task.count({ where: { organizationId } }),
      cases: await app.prisma.reputationCase.count({ where: { organizationId } }),
      replies: await app.prisma.reviewReply.count({ where: { organizationId } }),
    }).toEqual(beforeWrites);
  });

  it('keeps Ask Shield history tenant-scoped with not-found semantics', async () => {
    aiProviderRegistry.register(fakeProvider, { active: true });
    const own = await app.prisma.askShieldQuery.findFirstOrThrow({ where: { organizationId } });
    const crossTenant = await app.inject({ method: 'GET', url: `/api/v1/ask-shield/queries/${own.id}`, headers: { cookie: otherCookie } });
    expect(crossTenant.statusCode).toBe(404);
    expect(crossTenant.json()).toMatchObject({ error: { code: 'ASK_SHIELD_QUERY_NOT_FOUND' } });

    const otherHistory = await app.inject({ method: 'GET', url: '/api/v1/ask-shield/queries', headers: { cookie: otherCookie } });
    expect(otherHistory.statusCode).toBe(200);
    expect(otherHistory.json().items).toHaveLength(0);
  });
});
