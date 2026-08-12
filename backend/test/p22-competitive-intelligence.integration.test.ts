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
  throw new Error('P22 integration tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('P22 Competitive Intelligence', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sessionToken = `p22-${randomUUID()}`;
  const otherSessionToken = `p22-other-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const otherCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(otherSessionToken)}`;
  let businessId = '';
  let ownLocationId = '';
  let reviewSourceId = '';

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.createMany({
      data: [
        { id: organizationId, name: 'P22 Org', slug: `p22-${randomUUID()}`, plan: 'GROWTH' },
        { id: otherOrganizationId, name: 'P22 Other Org', slug: `p22-other-${randomUUID()}`, plan: 'GROWTH' },
      ],
    });
    await app.prisma.user.createMany({
      data: [
        { id: userId, phone: `+7${Date.now()}51`, displayName: 'P22 Owner', profileCompletedAt: new Date() },
        { id: otherUserId, phone: `+7${Date.now()}52`, displayName: 'P22 Other Owner', profileCompletedAt: new Date() },
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
        { userId, activeOrganizationId: organizationId, tokenHash: hashSessionToken(sessionToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
        { userId: otherUserId, activeOrganizationId: otherOrganizationId, tokenHash: hashSessionToken(otherSessionToken), expiresAt: new Date(Date.now() + 30 * 60_000) },
      ],
    });
    const business = await app.prisma.business.create({ data: { organizationId, name: 'P22 Business', isPrimary: true, status: 'ACTIVE' } });
    businessId = business.id;
    const location = await app.prisma.location.create({ data: { businessId, name: 'P22 Own Location', isPrimary: true, status: 'ACTIVE' } });
    ownLocationId = location.id;
    const source = await app.prisma.reviewSource.create({
      data: { organizationId, businessId, locationId: ownLocationId, provider: 'p22-fixture', name: 'P22 Fixture' },
    });
    reviewSourceId = source.id;
    const ratings = [5, 4, 4, 2, 1];
    for (let index = 0; index < ratings.length; index += 1) {
      await app.prisma.review.create({
        data: {
          organizationId,
          businessId,
          locationId: ownLocationId,
          sourceId: reviewSourceId,
          externalId: `p22-own-${index}-${randomUUID()}`,
          rating: ratings[index]!,
          text: `P22 review ${index}`,
          receivedAt: new Date(Date.now() - index * 24 * 60 * 60 * 1000),
          publishedAt: new Date(Date.now() - index * 24 * 60 * 60 * 1000),
          repliedAt: index < 4 ? new Date(Date.now() - index * 24 * 60 * 60 * 1000 + 20 * 60_000) : null,
        },
      });
    }
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await app.close();
  });

  async function createCompetitor() {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/competitive/competitors',
      headers: { cookie },
      payload: {
        name: `Competitor ${randomUUID()}`,
        website: 'https://competitor.example/',
        locations: [{
          name: 'Competitor Tula',
          city: 'Tula',
          countryCode: 'RU',
          googlePlaceId: 'ChIJP22ExamplePlaceId12345',
        }],
      },
    });
    expect(response.statusCode).toBe(201);
    return response.json().competitor;
  }

  it('creates tenant-scoped competitors with persistable manual and live-only Google sources', async () => {
    const competitor = await createCompetitor();
    expect(competitor).toMatchObject({ status: 'active', locations: [{ name: 'Competitor Tula' }] });
    const sources = competitor.locations[0].sources as Array<{ provider: string; storagePolicy: string; externalId: string | null }>;
    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: 'manual', storagePolicy: 'persistable', externalId: null }),
      expect.objectContaining({ provider: 'google_places', storagePolicy: 'live_only', externalId: 'ChIJP22ExamplePlaceId12345' }),
    ]));

    const crossTenant = await app.inject({
      method: 'GET',
      url: `/api/v1/competitive/competitors/${competitor.id}`,
      headers: { cookie: otherCookie },
    });
    expect(crossTenant.statusCode).toBe(404);

    const googleSource = await app.prisma.competitiveSource.findFirstOrThrow({
      where: { organizationId, competitorLocationId: competitor.locations[0].id, provider: 'GOOGLE_PLACES' },
    });
    expect(googleSource).toMatchObject({ storagePolicy: 'LIVE_ONLY' });
    expect(await app.prisma.competitiveMetricSnapshot.count({ where: { sourceId: googleSource.id } })).toBe(0);
  });

  it('stores historical metrics only through the persistable source and deduplicates snapshots', async () => {
    const competitor = await createCompetitor();
    const locationId = competitor.locations[0].id as string;
    const payload = {
      observedAt: '2026-08-11T10:00:00.000Z',
      averageRating: 4.6,
      reviewCount: 240,
      reviewVelocity30d: 22,
      positiveShare: 0.86,
      negativeShare: 0.06,
      responseRate: 0.91,
      reputationScore: 84,
      notes: 'Verified manual snapshot',
      dedupeKey: 'manual-2026-08-11',
    };
    const first = await app.inject({
      method: 'POST',
      url: `/api/v1/competitive/competitors/${competitor.id}/locations/${locationId}/snapshots`,
      headers: { cookie },
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({ deduplicated: false, snapshot: { provider: 'manual', storagePolicy: 'persistable', averageRating: 4.6, reviewCount: 240 } });

    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/v1/competitive/competitors/${competitor.id}/locations/${locationId}/snapshots`,
      headers: { cookie },
      payload,
    });
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({ deduplicated: true });

    const manualSource = await app.prisma.competitiveSource.findFirstOrThrow({ where: { competitorLocationId: locationId, provider: 'MANUAL' } });
    expect(await app.prisma.competitiveMetricSnapshot.count({ where: { sourceId: manualSource.id } })).toBe(1);
  });

  it('compares first-party review metrics with the latest persistable competitor snapshot and exposes coverage', async () => {
    const competitor = await createCompetitor();
    const locationId = competitor.locations[0].id as string;
    const snapshot = await app.inject({
      method: 'POST',
      url: `/api/v1/competitive/competitors/${competitor.id}/locations/${locationId}/snapshots`,
      headers: { cookie },
      payload: {
        averageRating: 4.8,
        reviewCount: 500,
        reviewVelocity30d: 30,
        positiveShare: 0.9,
        negativeShare: 0.03,
        responseRate: 0.7,
      },
    });
    expect(snapshot.statusCode).toBe(201);

    const benchmark = await app.inject({
      method: 'GET',
      url: `/api/v1/competitive/benchmark?businessId=${businessId}&locationId=${ownLocationId}`,
      headers: { cookie },
    });
    expect(benchmark.statusCode).toBe(200);
    expect(benchmark.json().own).toMatchObject({ reviewCount: 5, averageRating: 3.2, responseRate: 0.8 });
    const row = benchmark.json().competitors.find((item: { competitorId: string }) => item.competitorId === competitor.id);
    expect(row).toMatchObject({
      competitorId: competitor.id,
      locationId,
      metrics: { averageRating: 4.8, reviewCount: 500 },
      coverage: { liveGoogleLinked: true },
      deltas: { averageRating: -1.6, reviewCount: -495 },
    });
    expect(row.coverage.availableMetrics).toEqual(expect.arrayContaining(['averageRating', 'reviewCount', 'responseRate']));
    expect(benchmark.json().methodology).toMatchObject({ googlePlaces: 'live_only_not_persisted' });
  });

  it('returns explicit provider unavailability without inventing Google live data', async () => {
    const providers = await app.inject({ method: 'GET', url: '/api/v1/competitive/providers', headers: { cookie } });
    expect(providers.statusCode).toBe(200);
    expect(providers.json()).toMatchObject({
      googlePlaces: { configured: false, storagePolicy: 'LIVE_ONLY', attributionRequired: true, reasonCode: 'GOOGLE_PLACES_NOT_CONFIGURED' },
    });

    const search = await app.inject({
      method: 'POST',
      url: '/api/v1/competitive/live/google/search',
      headers: { cookie },
      payload: { query: 'coffee Tula', languageCode: 'ru' },
    });
    expect(search.statusCode).toBe(409);
    expect(search.json()).toMatchObject({ error: { code: 'GOOGLE_PLACES_NOT_CONFIGURED' } });
  });

  it('rejects invalid own-company benchmark scope across tenants', async () => {
    const otherBusiness = await app.prisma.business.create({ data: { organizationId: otherOrganizationId, name: 'Other Business', status: 'ACTIVE' } });
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/competitive/benchmark?businessId=${otherBusiness.id}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'BUSINESS_NOT_FOUND' } });
  });
});
