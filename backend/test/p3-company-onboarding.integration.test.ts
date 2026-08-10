import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p3|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P3 integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('P3 company, onboarding, businesses, and locations', () => {
  let app: FastifyInstance;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const businessAId = randomUUID();
  const businessBId = randomUUID();
  const sessionToken = `p3-integration-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.createMany({ data: [
      { id: organizationAId, name: 'P3 Organization A', slug: `p3-a-${randomUUID()}` },
      { id: organizationBId, name: 'P3 Organization B', slug: `p3-b-${randomUUID()}` },
    ] });
    await app.prisma.user.createMany({ data: [
      { id: userAId, phone: `+7${Date.now()}31`, displayName: 'P3 User A', profileCompletedAt: new Date() },
      { id: userBId, phone: `+7${Date.now()}32`, displayName: 'P3 User B', profileCompletedAt: new Date() },
    ] });
    await app.prisma.organizationMember.createMany({ data: [
      { organizationId: organizationAId, userId: userAId, role: 'OWNER', status: 'ACTIVE' },
      { organizationId: organizationBId, userId: userBId, role: 'OWNER', status: 'ACTIVE' },
    ] });
    await app.prisma.business.createMany({ data: [
      { id: businessAId, organizationId: organizationAId, name: 'Business A', isPrimary: true },
      { id: businessBId, organizationId: organizationBId, name: 'Business B', isPrimary: true },
    ] });
    await app.prisma.session.create({ data: {
      userId: userAId,
      activeOrganizationId: organizationAId,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    } });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await app.close();
  });

  it('persists onboarding draft and company profile on the server', async () => {
    const saved = await app.inject({ method: 'PATCH', url: '/api/v1/onboarding/state', headers: { cookie }, payload: {
      step: 1,
      draft: { version: 2, step: 1, organization: { title: 'Draft company' }, integrations: {}, security: {} },
    } });
    expect(saved.statusCode).toBe(200);

    const restored = await app.inject({ method: 'GET', url: '/api/v1/onboarding/state', headers: { cookie } });
    expect(restored.json()).toMatchObject({ onboarding: { onboardingStatus: 'IN_PROGRESS', onboardingStep: 1, onboardingDraft: { organization: { title: 'Draft company' } } } });

    const updated = await app.inject({ method: 'PATCH', url: '/api/v1/company/profile', headers: { cookie }, payload: {
      title: 'Persisted company', industry: 'Retail', website: 'https://example.test',
    } });
    expect(updated.statusCode).toBe(200);
    const profile = await app.inject({ method: 'GET', url: '/api/v1/company/profile', headers: { cookie } });
    expect(profile.json()).toMatchObject({ company: { title: 'Persisted company', industry: 'Retail', website: 'https://example.test' } });
  });

  it('supports tenant-scoped business and location CRUD with one primary', async () => {
    const createdBusiness = await app.inject({ method: 'POST', url: `/api/v1/organizations/${organizationAId}/businesses`, headers: { cookie }, payload: { name: 'Second business', is_primary: true } });
    expect(createdBusiness.statusCode).toBe(200);
    const secondBusinessId = createdBusiness.json().business.id as string;

    const createdLocation = await app.inject({ method: 'POST', url: `/api/v1/businesses/${secondBusinessId}/locations`, headers: { cookie }, payload: { name: 'Moscow', latitude: 55.75, longitude: 37.61 } });
    expect(createdLocation.statusCode).toBe(200);
    const locationId = createdLocation.json().location.id as string;
    const detail = await app.inject({ method: 'GET', url: `/api/v1/locations/${locationId}`, headers: { cookie } });
    expect(detail.statusCode).toBe(200);
    expect(detail.json()).toMatchObject({ location: { id: locationId, isPrimary: true } });

    const cleared = await app.inject({ method: 'PATCH', url: `/api/v1/locations/${locationId}`, headers: { cookie }, payload: { latitude: null, longitude: null } });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json()).toMatchObject({ location: { latitude: null, longitude: null } });

    const businesses = await app.prisma.business.findMany({ where: { organizationId: organizationAId, status: 'ACTIVE', isPrimary: true } });
    expect(businesses).toHaveLength(1);
  });

  it('returns indistinguishable 404s for foreign business and location IDs', async () => {
    const foreignLocation = await app.prisma.location.create({ data: { businessId: businessBId, name: 'Foreign', isPrimary: true } });
    for (const request of [
      { method: 'GET' as const, url: `/api/v1/businesses/${businessBId}` },
      { method: 'PATCH' as const, url: `/api/v1/businesses/${businessBId}`, payload: { name: 'Stolen' } },
      { method: 'POST' as const, url: `/api/v1/businesses/${businessBId}/locations`, payload: { name: 'Stolen' } },
      { method: 'GET' as const, url: `/api/v1/locations/${foreignLocation.id}` },
      { method: 'PATCH' as const, url: `/api/v1/locations/${foreignLocation.id}`, payload: { name: 'Stolen' } },
      { method: 'DELETE' as const, url: `/api/v1/locations/${foreignLocation.id}` },
    ]) {
      const response = await app.inject({ ...request, headers: { cookie } });
      expect(response.statusCode).toBe(404);
    }
  });

  it('completes onboarding once and does not duplicate locations on retry', async () => {
    const payload = {
      organization: { type: 'ul', title: 'Completed company', inn: '7701234567', kpp: '770101001', ogrn: '1027700123456', confirmed: true, source: 'forged-official' },
      business: { name: 'Completed business' },
      locations: [{ name: 'Completed location', is_primary: true }],
      integrations: [],
    };
    const first = await app.inject({ method: 'POST', url: '/api/v1/onboarding/complete', headers: { cookie }, payload });
    expect(first.statusCode).toBe(200);
    const count = await app.prisma.location.count({ where: { business: { organizationId: organizationAId }, status: 'ACTIVE' } });

    const second = await app.inject({ method: 'POST', url: '/api/v1/onboarding/complete', headers: { cookie }, payload });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: 'ONBOARDING_ALREADY_COMPLETED' } });
    expect(await app.prisma.location.count({ where: { business: { organizationId: organizationAId }, status: 'ACTIVE' } })).toBe(count);

    const organization = await app.prisma.organization.findUniqueOrThrow({ where: { id: organizationAId } });
    expect(organization.registrySource).toBe('manual');
    expect(organization.registryVerifiedAt).toBeNull();
  });
});
