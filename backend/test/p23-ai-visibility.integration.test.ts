import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { aiProviderRegistry } from '../src/modules/ai/ai-provider.registry.js';
import type { AiReviewIntelligenceProvider } from '../src/modules/ai/ai-provider.types.js';
import { processVisibilityRunJob } from '../src/modules/ai-visibility/ai-visibility.service.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P23 integration tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('P23 AI Visibility / GEO Monitor', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const freeOrganizationId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const freeUserId = randomUUID();
  const sessionToken = `p23-${randomUUID()}`;
  const otherSessionToken = `p23-other-${randomUUID()}`;
  const freeSessionToken = `p23-free-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const otherCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(otherSessionToken)}`;
  const freeCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(freeSessionToken)}`;
  let locationId = '';

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.createMany({
      data: [
        { id: organizationId, name: 'P23 Pro Org', slug: `p23-${randomUUID()}` },
        { id: otherOrganizationId, name: 'P23 Other Org', slug: `p23-other-${randomUUID()}` },
        { id: freeOrganizationId, name: 'P23 Free Org', slug: `p23-free-${randomUUID()}` },
      ],
    });
    await app.prisma.user.createMany({
      data: [
        { id: userId, phone: `+7${Date.now()}61`, displayName: 'P23 Owner', profileCompletedAt: new Date() },
        { id: otherUserId, phone: `+7${Date.now()}62`, displayName: 'P23 Other', profileCompletedAt: new Date() },
        { id: freeUserId, phone: `+7${Date.now()}63`, displayName: 'P23 Free', profileCompletedAt: new Date() },
      ],
    });
    await app.prisma.organizationMember.createMany({
      data: [
        { organizationId, userId, role: 'OWNER', status: 'ACTIVE' },
        { organizationId: otherOrganizationId, userId: otherUserId, role: 'OWNER', status: 'ACTIVE' },
        { organizationId: freeOrganizationId, userId: freeUserId, role: 'OWNER', status: 'ACTIVE' },
      ],
    });
    await app.prisma.session.createMany({
      data: [
        { userId, activeOrganizationId: organizationId, tokenHash: hashSessionToken(sessionToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
        { userId: otherUserId, activeOrganizationId: otherOrganizationId, tokenHash: hashSessionToken(otherSessionToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
        { userId: freeUserId, activeOrganizationId: freeOrganizationId, tokenHash: hashSessionToken(freeSessionToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
      ],
    });
    const pro = await app.prisma.plan.findUniqueOrThrow({ where: { code: 'PRO' } });
    const free = await app.prisma.plan.findUniqueOrThrow({ where: { code: 'FREE' } });
    await app.prisma.subscription.createMany({
      data: [
        { organizationId, planId: pro.id, status: 'ACTIVE' },
        { organizationId: otherOrganizationId, planId: pro.id, status: 'ACTIVE' },
        { organizationId: freeOrganizationId, planId: free.id, status: 'ACTIVE' },
      ],
    });
    const business = await app.prisma.business.create({ data: { organizationId, name: 'P23 Coffee', isPrimary: true, status: 'ACTIVE' } });
    const location = await app.prisma.location.create({ data: { businessId: business.id, name: 'P23 Tula', city: 'Tula', isPrimary: true, status: 'ACTIVE' } });
    locationId = location.id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId, freeOrganizationId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId, freeUserId] } } });
    await app.close();
  });

  async function createProbe(headersCookie = cookie) {
    return app.inject({
      method: 'POST',
      url: '/api/v1/ai-visibility/probes',
      headers: { cookie: headersCookie },
      payload: {
        name: `coffee discovery ${randomUUID()}`,
        query: 'best coffee shop in Tula for a quiet meeting',
        locationId,
        languageCode: 'en',
        countryCode: 'RU',
      },
    });
  }

  it('enforces the PRO entitlement on the server', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/ai-visibility/probes',
      headers: { cookie: freeCookie },
      payload: { name: 'Free probe', query: 'best coffee nearby', languageCode: 'en' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'ENTITLEMENT_REQUIRED' } });
  });

  it('keeps probes and runs tenant-scoped', async () => {
    const created = await createProbe();
    expect(created.statusCode).toBe(201);
    const probe = created.json().probe;

    const crossTenant = await app.inject({ method: 'GET', url: `/api/v1/ai-visibility/probes/${probe.id}`, headers: { cookie: otherCookie } });
    expect(crossTenant.statusCode).toBe(404);
    expect(crossTenant.json()).toMatchObject({ error: { code: 'AI_VISIBILITY_PROBE_NOT_FOUND' } });
  });

  it('does not invent a run when the configured provider is unavailable', async () => {
    const created = await createProbe();
    expect(created.statusCode).toBe(201);
    const probeId = created.json().probe.id as string;
    const before = await app.prisma.aiVisibilityRun.count({ where: { organizationId, probeId } });

    const response = await app.inject({ method: 'POST', url: `/api/v1/ai-visibility/probes/${probeId}/runs`, headers: { cookie } });
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toMatch(/AI_/);
    expect(await app.prisma.aiVisibilityRun.count({ where: { organizationId, probeId } })).toBe(before);
  });

  it('creates one durable job and persists provider evidence for a successful grounded run', async () => {
    const previous = aiProviderRegistry.active();
    const fakeProvider: AiReviewIntelligenceProvider = {
      id: 'p23-test-grounded',
      model: 'p23-test-model',
      promptVersion: 'p23-test-review',
      availability: () => ({ configured: true, available: true }),
      healthCheck: async () => ({ configured: true, available: true }),
      analyzeReview: async () => { throw new Error('not used'); },
      runVisibilityProbe: async () => ({
        provider: 'p23-test-grounded',
        model: 'p23-test-model',
        modelVersion: 'test-v1',
        promptVersion: 'p23-test-visibility',
        inputTokens: 120,
        outputTokens: 80,
        estimatedCostMicros: 42,
        citationMeasurement: 'SUPPORTED',
        citations: [{ url: 'https://example.com/tula-coffee', title: 'Tula coffee guide' }],
        output: {
          brandMentioned: true,
          brandPosition: 2,
          sentiment: 'POSITIVE',
          competitors: [{ name: 'Competitor Coffee', position: 1 }],
          recommendations: ['Improve locally relevant factual content.'],
          answerSummary: 'Competitor Coffee was listed first; P23 Coffee appeared second.',
        },
      }),
    };
    aiProviderRegistry.register(fakeProvider, { active: true });
    try {
      const created = await createProbe();
      expect(created.statusCode).toBe(201);
      const probeId = created.json().probe.id as string;

      const queued = await app.inject({ method: 'POST', url: `/api/v1/ai-visibility/probes/${probeId}/runs`, headers: { cookie } });
      expect(queued.statusCode).toBe(202);
      const runId = queued.json().run.id as string;
      expect(await app.prisma.job.count({ where: { organizationId, type: 'aiVisibility.run', payload: { path: ['runId'], equals: runId } } })).toBe(1);

      const deduped = await app.inject({ method: 'POST', url: `/api/v1/ai-visibility/probes/${probeId}/runs`, headers: { cookie } });
      expect(deduped.statusCode).toBe(200);
      expect(deduped.json()).toMatchObject({ deduplicated: true, run: { id: runId } });

      await processVisibilityRunJob(app.prisma, { organizationId, runId });
      const finished = await app.prisma.aiVisibilityRun.findUniqueOrThrow({
        where: { id: runId },
        include: { result: { include: { citations: true, competitors: true } } },
      });
      expect(finished).toMatchObject({ status: 'SUCCEEDED', provider: 'p23-test-grounded', model: 'p23-test-model' });
      expect(finished.result).toMatchObject({ brandMentioned: true, brandPosition: 2, citationMeasurement: 'SUPPORTED' });
      expect(finished.result?.citations).toEqual([expect.objectContaining({ domain: 'example.com', position: 1 })]);
      expect(finished.result?.competitors).toEqual([expect.objectContaining({ name: 'Competitor Coffee', position: 1 })]);

      const metrics = await app.inject({ method: 'GET', url: '/api/v1/ai-visibility/metrics', headers: { cookie } });
      expect(metrics.statusCode).toBe(200);
      expect(metrics.json()).toMatchObject({
        sampleSize: 1,
        brandMentionRate: 100,
        shareOfAiVoice: 50,
        averageAiPosition: 2,
        competitorMentionRate: 100,
        citationCoverage: 100,
        citationQuality: { measured: false },
      });
    } finally {
      if (previous) aiProviderRegistry.register(previous, { active: true });
    }
  });
});
