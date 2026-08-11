import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { providerRegistry } from '../src/modules/integrations/providers/provider.registry.js';
import type { ProviderAdapter, ProviderLocationProfileRecord } from '../src/modules/integrations/providers/provider.types.js';
import { calculateLocationHealth, processListingSyncJob } from '../src/modules/listings/listing-health.service.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P24 integration tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('P24 Listings & Location Health', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sessionToken = `p24-${randomUUID()}`;
  const otherSessionToken = `p24-other-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const otherCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(otherSessionToken)}`;
  let locationId = '';
  let integrationAccountId = '';
  const providerId = `p24-test-${randomUUID()}`;

  const exactRecord: ProviderLocationProfileRecord = {
    externalId: 'locations/p24-1',
    title: 'P24 Coffee Tula',
    address: 'RU, Tula, Tula, Lenina 1, 300000',
    phone: '+74872111111',
    website: 'https://p24.example/',
    regularHours: { monday: '09:00-18:00' },
    categories: ['Coffee shop'],
    coveredFields: ['name', 'address', 'phone', 'website', 'regularHours', 'categories'],
    observedAt: new Date(),
    raw: { source: 'p24-test-provider' },
  };

  beforeAll(async () => {
    app = await buildApp();
    const adapter: ProviderAdapter = {
      id: providerId,
      displayName: 'P24 Test Provider',
      capabilities: ['profile.read'],
      availability: () => ({ configured: true, connectable: true }),
      connect: async () => ({ verified: true, health: 'CONNECTED' }),
      syncLocationProfiles: async () => [exactRecord],
    };
    providerRegistry.register(adapter);

    await app.prisma.organization.createMany({
      data: [
        { id: organizationId, name: 'P24 Org', slug: `p24-${randomUUID()}` },
        { id: otherOrganizationId, name: 'P24 Other', slug: `p24-other-${randomUUID()}` },
      ],
    });
    await app.prisma.user.createMany({
      data: [
        { id: userId, phone: `+7${Date.now()}71`, displayName: 'P24 Owner', profileCompletedAt: new Date() },
        { id: otherUserId, phone: `+7${Date.now()}72`, displayName: 'P24 Other', profileCompletedAt: new Date() },
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
    const business = await app.prisma.business.create({ data: { organizationId, name: 'P24 Coffee', isPrimary: true, status: 'ACTIVE' } });
    const location = await app.prisma.location.create({
      data: {
        businessId: business.id,
        name: 'P24 Coffee Tula',
        isPrimary: true,
        status: 'ACTIVE',
        countryCode: 'RU',
        region: 'Tula',
        city: 'Tula',
        addressLine1: 'Lenina 1',
        postalCode: '300000',
        phone: '+74872111111',
        website: 'https://p24.example/',
        regularHours: { monday: '09:00-18:00' },
        categories: ['Coffee shop'],
        images: ['https://p24.example/image.jpg'],
      },
    });
    locationId = location.id;
    const account = await app.prisma.integrationAccount.create({
      data: { organizationId, provider: providerId, name: 'P24 Test Account', externalAccountId: 'accounts/p24', status: 'CONNECTED', configuration: {} },
    });
    integrationAccountId = account.id;
  });

  afterAll(async () => {
    providerRegistry.unregister(providerId);
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await app.close();
  });

  it('does not penalize profile fields the provider cannot measure', async () => {
    const location = await app.prisma.location.findUniqueOrThrow({ where: { id: locationId } });
    const measurement = calculateLocationHealth(location, exactRecord, new Date());
    expect(measurement.score).toBe(100);
    expect(measurement.measuredFields).not.toContain('images');
    expect(measurement.unmeasuredFields).toContain('images');
    expect(measurement.issues).toHaveLength(0);
  });

  it('creates an explainable mismatch instead of hiding the score decrease', async () => {
    const location = await app.prisma.location.findUniqueOrThrow({ where: { id: locationId } });
    const measurement = calculateLocationHealth(location, { ...exactRecord, phone: '+70000000000' }, new Date());
    expect(measurement.score).toBeLessThan(100);
    expect(measurement.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'MISMATCH', severity: 'CRITICAL', field: 'phone', explanation: expect.stringContaining('отличается') }),
    ]));
  });

  it('maps a real provider source, queues durable sync and stores evidence', async () => {
    const mapped = await app.inject({
      method: 'POST',
      url: `/api/v1/listing-health/locations/${locationId}/sources`,
      headers: { cookie },
      payload: { integrationAccountId, externalLocationId: exactRecord.externalId },
    });
    expect(mapped.statusCode).toBe(201);
    const sourceId = mapped.json().source.id as string;

    const queued = await app.inject({ method: 'POST', url: `/api/v1/listing-health/sources/${sourceId}/sync`, headers: { cookie } });
    expect(queued.statusCode).toBe(202);
    expect(await app.prisma.job.count({ where: { organizationId, type: 'listing.sync', payload: { path: ['sourceId'], equals: sourceId } } })).toBe(1);

    await processListingSyncJob(app.prisma, { organizationId, sourceId });
    const snapshot = await app.prisma.listingSnapshot.findFirstOrThrow({ where: { sourceId }, include: { issues: true } });
    expect(snapshot.healthScore).toBe(100);
    expect(snapshot.scoreVersion).toBe(1);
    expect(snapshot.issues).toHaveLength(0);
    expect(snapshot.normalized).toMatchObject({ unmeasuredFields: expect.arrayContaining(['images']) });
  });

  it('uses not-found semantics across tenants', async () => {
    const response = await app.inject({ method: 'GET', url: `/api/v1/listing-health/locations/${locationId}`, headers: { cookie: otherCookie } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'LOCATION_NOT_FOUND' } });
  });
});
