import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';
import { encryptIntegrationSecret } from '../src/modules/integrations/providers/credential-vault.js';
import { providerRegistry } from '../src/modules/integrations/providers/provider.registry.js';
import type { ProviderAdapter, ProviderConnectionContext, ProviderReviewSyncResult } from '../src/modules/integrations/providers/provider.types.js';
import { processIntegrationReviewSync } from '../src/modules/integrations/review-ingestion.service.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P17 ingestion integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

type SyncMode = 'initial' | 'updated' | 'partial';

describeWithPostgres('P17 canonical review ingestion', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const sessionToken = `p17-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const providerId = `p17-provider-${randomUUID()}`.toLowerCase();
  const accountId = randomUUID();
  const providerSecret = `provider-refresh-${randomUUID()}`;
  let mode: SyncMode = 'initial';
  const observedCredentials: string[] = [];

  function review(id: string, rating: number, text: string, updatedAt: string) {
    return {
      externalId: id,
      rating,
      text,
      authorName: `Author ${id}`,
      authorExternalId: `author-${id}`,
      publishedAt: new Date('2026-08-01T10:00:00.000Z'),
      providerUpdatedAt: new Date(updatedAt),
      providerLocationId: 'locations/provider_location_1',
      providerLocationName: 'Тула',
      raw: { providerReviewId: id },
    };
  }

  const syncReviews = vi.fn(async (context: ProviderConnectionContext, cursor?: string): Promise<ProviderReviewSyncResult> => {
    observedCredentials.push(context.credentials.refreshToken || '');
    if (mode === 'partial') {
      return {
        reviews: [
          review('review-1', 5, 'Стабильный отзыв', '2026-08-01T10:00:00.000Z'),
          review('malformed-review', 0, 'Некорректный рейтинг', '2026-08-04T10:00:00.000Z'),
        ],
        hasMore: false,
      };
    }

    if (!cursor) {
      return {
        reviews: [
          review('review-1', 5, 'Стабильный отзыв', '2026-08-01T10:00:00.000Z'),
          review(
            'review-2',
            mode === 'updated' ? 2 : 3,
            mode === 'updated' ? 'Отзыв изменён провайдером' : 'Исходный отзыв',
            mode === 'updated' ? '2026-08-03T12:00:00.000Z' : '2026-08-02T10:00:00.000Z',
          ),
        ],
        hasMore: true,
        nextCursor: 'page-2',
      };
    }
    expect(cursor).toBe('page-2');
    return {
      reviews: [review('review-3', 4, 'Вторая страница', '2026-08-02T11:00:00.000Z')],
      hasMore: false,
    };
  });

  const adapter: ProviderAdapter = {
    id: providerId,
    displayName: 'P17 test provider',
    capabilities: ['reviews.read'],
    availability: () => ({ configured: true, connectable: true }),
    connect: vi.fn(async () => ({ verified: true as const, health: 'CONNECTED' as const })),
    syncReviews,
  };

  beforeAll(async () => {
    providerRegistry.register(adapter);
    app = await buildApp();

    await app.prisma.organization.createMany({
      data: [
        { id: organizationId, name: 'P17 Org', slug: `p17-${randomUUID()}` },
        { id: otherOrganizationId, name: 'Other Org', slug: `p17-other-${randomUUID()}` },
      ],
    });
    await app.prisma.user.create({
      data: { id: userId, phone: `+7${Date.now()}71`, displayName: 'P17 Owner', profileCompletedAt: new Date() },
    });
    await app.prisma.organizationMember.create({
      data: { organizationId, userId, role: 'OWNER', status: 'ACTIVE' },
    });
    await app.prisma.session.create({
      data: {
        userId,
        activeOrganizationId: organizationId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 20 * 60_000),
      },
    });

    const business = await app.prisma.business.create({
      data: { organizationId, name: 'P17 Business', isPrimary: true, status: 'ACTIVE' },
    });
    await app.prisma.location.create({
      data: { businessId: business.id, name: 'Тула', isPrimary: true, status: 'ACTIVE' },
    });

    const otherBusiness = await app.prisma.business.create({
      data: { organizationId: otherOrganizationId, name: 'Other Business', isPrimary: true, status: 'ACTIVE' },
    });
    const otherSource = await app.prisma.reviewSource.create({
      data: {
        organizationId: otherOrganizationId,
        businessId: otherBusiness.id,
        provider: providerId,
        name: 'Other source',
        externalAccountId: 'locations/provider_location_1',
        status: 'ACTIVE',
      },
    });
    await app.prisma.review.create({
      data: {
        organizationId: otherOrganizationId,
        businessId: otherBusiness.id,
        sourceId: otherSource.id,
        externalId: 'review-1',
        rating: 1,
        text: 'Не должен измениться',
        publishedAt: new Date('2025-01-01T00:00:00.000Z'),
      },
    });

    await app.prisma.integrationAccount.create({
      data: {
        id: accountId,
        organizationId,
        provider: providerId,
        name: 'P17 provider account',
        externalAccountId: 'accounts/provider_account_1',
        status: 'CONNECTED',
        configuration: { googleSelectedLocationNames: ['locations/provider_location_1'] },
      },
    });
    await app.prisma.integrationCredential.create({
      data: {
        accountId,
        key: 'refreshToken',
        encryptedValue: encryptIntegrationSecret(providerSecret),
        keyVersion: 1,
      },
    });
  });

  afterAll(async () => {
    providerRegistry.unregister(providerId);
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await app.prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  async function queueSync() {
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/${accountId}/sync`,
      headers: { cookie },
    });
    if (response.statusCode !== 202) {
      throw new Error(`P17 queue sync failed (${response.statusCode}): ${response.body}`);
    }
    return response.json().run as { id: string; status: string };
  }

  async function completeQueuedJob(syncRunId: string) {
    await app.prisma.job.updateMany({
      where: { organizationId, type: 'integration.sync.reviews', payload: { path: ['syncRunId'], equals: syncRunId } },
      data: { status: 'SUCCEEDED', completedAt: new Date() },
    });
  }

  it('collapses concurrent queue requests and imports provider pages canonically', async () => {
    const [first, second] = await Promise.all([queueSync(), queueSync()]);
    expect(first.id).toBe(second.id);

    const jobs = await app.prisma.job.findMany({
      where: { organizationId, type: 'integration.sync.reviews' },
    });
    expect(jobs.filter((job) => JSON.stringify(job.payload).includes(first.id))).toHaveLength(1);
    expect(jobs[0]?.dedupeKey).toContain(first.id);

    const counters = await processIntegrationReviewSync(app.prisma, { syncRunId: first.id, accountId });
    expect(counters).toEqual({ imported: 3, updated: 0, skipped: 0, errors: 0 });
    await completeQueuedJob(first.id);

    const run = await app.prisma.integrationSyncRun.findUniqueOrThrow({ where: { id: first.id } });
    expect(run).toMatchObject({ status: 'SUCCESS', importedCount: 3, updatedCount: 0, skippedCount: 0, errorCount: 0 });

    const sources = await app.prisma.reviewSource.findMany({ where: { organizationId, provider: providerId } });
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      externalAccountId: 'locations/provider_location_1',
      name: 'P17 provider account · Тула',
    });
    expect(sources[0]?.locationId).toBeTruthy();

    const reviews = await app.prisma.review.findMany({
      where: { organizationId, sourceId: sources[0]!.id },
      include: { author: true },
      orderBy: { externalId: 'asc' },
    });
    expect(reviews).toHaveLength(3);
    expect(reviews.map((item) => item.externalId)).toEqual(['review-1', 'review-2', 'review-3']);
    expect(reviews.every((item) => item.author?.name.startsWith('Author review-'))).toBe(true);
    expect(observedCredentials).toEqual(expect.arrayContaining([providerSecret]));

    const isolated = await app.prisma.review.findFirstOrThrow({
      where: { organizationId: otherOrganizationId, externalId: 'review-1' },
    });
    expect(isolated.text).toBe('Не должен измениться');
    expect(isolated.rating).toBe(1);
  });

  it('allows later sync runs and reports updates versus unchanged reviews without duplicates', async () => {
    mode = 'updated';
    const run = await queueSync();
    const previousJobs = await app.prisma.job.findMany({ where: { organizationId, type: 'integration.sync.reviews' } });
    expect(previousJobs.some((job) => job.dedupeKey === `integration-sync:${accountId}:${run.id}`)).toBe(true);

    const counters = await processIntegrationReviewSync(app.prisma, { syncRunId: run.id, accountId });
    expect(counters).toEqual({ imported: 0, updated: 1, skipped: 2, errors: 0 });
    await completeQueuedJob(run.id);

    const source = await app.prisma.reviewSource.findFirstOrThrow({ where: { organizationId, provider: providerId } });
    const reviews = await app.prisma.review.findMany({ where: { organizationId, sourceId: source.id } });
    expect(reviews).toHaveLength(3);
    const updated = reviews.find((item) => item.externalId === 'review-2');
    expect(updated).toMatchObject({ rating: 2, text: 'Отзыв изменён провайдером' });

    const storedRun = await app.prisma.integrationSyncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(storedRun).toMatchObject({ status: 'SUCCESS', importedCount: 0, updatedCount: 1, skippedCount: 2, errorCount: 0 });
  });

  it('finishes PARTIAL for malformed provider records while preserving valid reviews', async () => {
    mode = 'partial';
    const run = await queueSync();
    const counters = await processIntegrationReviewSync(app.prisma, { syncRunId: run.id, accountId });
    expect(counters).toEqual({ imported: 0, updated: 0, skipped: 1, errors: 1 });
    await completeQueuedJob(run.id);

    const storedRun = await app.prisma.integrationSyncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(storedRun).toMatchObject({ status: 'PARTIAL', skippedCount: 1, errorCount: 1, errorCode: 'PROVIDER_RECORDS_PARTIAL' });
    const account = await app.prisma.integrationAccount.findUniqueOrThrow({ where: { id: accountId } });
    expect(account.status).toBe('DEGRADED');
    expect(account.lastSyncedAt).toBeTruthy();

    const leakedEvents = await app.prisma.integrationEvent.findMany({ where: { organizationId, accountId } });
    expect(JSON.stringify(leakedEvents)).not.toContain(providerSecret);
  });
});
