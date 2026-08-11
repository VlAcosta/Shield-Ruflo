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
  throw new Error('P21 integration tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

describeWithPostgres('P21 Review Acquisition', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const otherOrganizationId = randomUUID();
  const userId = randomUUID();
  const otherUserId = randomUUID();
  const sessionToken = `p21-${randomUUID()}`;
  const otherSessionToken = `p21-other-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const otherCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(otherSessionToken)}`;
  let businessId = '';
  let locationId = '';

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.createMany({
      data: [
        { id: organizationId, name: 'P21 Org', slug: `p21-${randomUUID()}` },
        { id: otherOrganizationId, name: 'P21 Other Org', slug: `p21-other-${randomUUID()}` },
      ],
    });
    await app.prisma.user.createMany({
      data: [
        { id: userId, phone: `+7${Date.now()}41`, displayName: 'P21 Owner', profileCompletedAt: new Date() },
        { id: otherUserId, phone: `+7${Date.now()}42`, displayName: 'P21 Other Owner', profileCompletedAt: new Date() },
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
    const business = await app.prisma.business.create({ data: { organizationId, name: 'P21 Business', isPrimary: true, status: 'ACTIVE' } });
    businessId = business.id;
    const location = await app.prisma.location.create({ data: { businessId, name: 'P21 Tula', isPrimary: true, status: 'ACTIVE' } });
    locationId = location.id;
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationId, otherOrganizationId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await app.close();
  });

  async function createCampaign(options: { active?: boolean; collectContact?: boolean } = {}) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/acquisition/campaigns',
      headers: { cookie },
      payload: {
        name: `P21 Campaign ${randomUUID()}`,
        businessId,
        locationId,
        channel: 'QR',
        headline: 'Поделитесь впечатлением',
        collectContact: options.collectContact ?? true,
        caseBelowRating: 2,
        targets: [
          { provider: 'google-business-profile', label: 'Google', url: 'https://www.google.com/maps', priority: 10, enabled: true },
          { provider: 'trustpilot', label: 'Trustpilot', url: 'https://www.trustpilot.com/', priority: 20, enabled: true },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    const campaign = response.json().campaign;
    if (!options.active) return campaign;
    const activate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/acquisition/campaigns/${campaign.id}`,
      headers: { cookie },
      payload: { status: 'ACTIVE' },
    });
    expect(activate.statusCode).toBe(200);
    return activate.json().campaign;
  }

  it('enforces tenant isolation and refuses to activate a campaign without a public review target', async () => {
    const empty = await app.inject({
      method: 'POST',
      url: '/api/v1/acquisition/campaigns',
      headers: { cookie },
      payload: { name: 'Targetless', businessId, locationId, targets: [] },
    });
    expect(empty.statusCode).toBe(201);
    const emptyId = empty.json().campaign.id as string;

    const activate = await app.inject({
      method: 'PATCH',
      url: `/api/v1/acquisition/campaigns/${emptyId}`,
      headers: { cookie },
      payload: { status: 'ACTIVE' },
    });
    expect(activate.statusCode).toBe(422);
    expect(activate.json()).toMatchObject({ error: { code: 'ACQUISITION_TARGET_REQUIRED' } });

    const crossTenant = await app.inject({
      method: 'GET',
      url: `/api/v1/acquisition/campaigns/${emptyId}`,
      headers: { cookie: otherCookie },
    });
    expect(crossTenant.statusCode).toBe(404);
  });

  it('keeps public review targets identical for 1-star and 5-star feedback and opens a P20 Case only for low feedback', async () => {
    const campaign = await createCampaign({ active: true, collectContact: true });
    const session = `session-${randomUUID()}`;

    const publicPage = await app.inject({
      method: 'GET',
      url: `/api/v1/public/review-acquisition/${campaign.publicSlug}?session=${encodeURIComponent(session)}`,
    });
    expect(publicPage.statusCode).toBe(200);
    expect(publicPage.json()).toMatchObject({ compliance: { reviewGating: false } });
    const initialTargets = publicPage.json().campaign.publicReviewTargets;
    expect(initialTargets.map((item: { provider: string }) => item.provider)).toEqual(['google-business-profile', 'trustpilot']);

    const negative = await app.inject({
      method: 'POST',
      url: `/api/v1/public/review-acquisition/${campaign.publicSlug}/feedback`,
      payload: {
        rating: 1,
        text: 'Очень долго ждали и никто не объяснил причину.',
        contactName: 'Не сохранять без согласия',
        contactEmail: 'private@example.test',
        consentToContact: false,
        session,
      },
    });
    expect(negative.statusCode).toBe(201);
    expect(negative.json()).toMatchObject({ caseOpened: true, compliance: { reviewGating: false } });
    expect(negative.json().publicReviewTargets).toEqual(initialTargets);

    const positive = await app.inject({
      method: 'POST',
      url: `/api/v1/public/review-acquisition/${campaign.publicSlug}/feedback`,
      payload: { rating: 5, text: 'Всё отлично, спасибо!', consentToContact: false, session: `positive-${randomUUID()}` },
    });
    expect(positive.statusCode).toBe(201);
    expect(positive.json()).toMatchObject({ caseOpened: false, compliance: { reviewGating: false } });
    expect(positive.json().publicReviewTargets).toEqual(initialTargets);

    const lowFeedback = await app.prisma.reviewAcquisitionFeedback.findUniqueOrThrow({ where: { id: negative.json().feedbackId } });
    expect(lowFeedback).toMatchObject({ rating: 1, status: 'CASE_OPENED', contactName: null, contactEmail: null, consentToContact: false });
    expect(lowFeedback.caseId).toEqual(expect.any(String));
    await expect(app.prisma.reputationCase.findUniqueOrThrow({ where: { id: lowFeedback.caseId! } })).resolves.toMatchObject({ origin: 'SURVEY', severity: 'CRITICAL' });
  });

  it('stores contact data only with explicit consent and campaign opt-in', async () => {
    const campaign = await createCampaign({ active: true, collectContact: true });
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/public/review-acquisition/${campaign.publicSlug}/feedback`,
      payload: {
        rating: 4,
        text: 'Хорошо, но можно быстрее.',
        contactName: 'Иван',
        contactEmail: 'ivan@example.test',
        contactPhone: '+79990000000',
        consentToContact: true,
      },
    });
    expect(response.statusCode).toBe(201);
    const stored = await app.prisma.reviewAcquisitionFeedback.findUniqueOrThrow({ where: { id: response.json().feedbackId } });
    expect(stored).toMatchObject({
      contactName: 'Иван',
      contactEmail: 'ivan@example.test',
      contactPhone: '+79990000000',
      consentToContact: true,
    });
  });

  it('creates hashed invite links without pretending delivery and measures views, conversions and target clicks', async () => {
    const campaign = await createCampaign({ active: true });
    const inviteResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/acquisition/campaigns/${campaign.id}/invites`,
      headers: { cookie },
      payload: { channel: 'EMAIL', expiresInDays: 7, externalReference: 'order-42' },
    });
    expect(inviteResponse.statusCode).toBe(201);
    expect(inviteResponse.json().invite).toMatchObject({
      status: 'created',
      channel: 'email',
      delivery: { status: 'not_sent', reason: 'NO_DELIVERY_ADAPTER' },
    });
    const publicPath = inviteResponse.json().invite.publicPath as string;
    const inviteToken = new URL(`https://example.test${publicPath}`).searchParams.get('invite');
    expect(inviteToken).toBeTruthy();

    const storedInvite = await app.prisma.reviewAcquisitionInvite.findUniqueOrThrow({ where: { id: inviteResponse.json().invite.id } });
    expect(storedInvite.tokenHash).not.toContain(inviteToken!);
    expect(storedInvite.tokenHash).toMatch(/^[a-f0-9]{64}$/);

    // The invite's publicPath intentionally points to the frontend `/r/:slug` route.
    // Backend integration tests call the API surface directly while preserving the same token.
    const publicPage = await app.inject({
      method: 'GET',
      url: `/api/v1/public/review-acquisition/${campaign.publicSlug}?invite=${encodeURIComponent(inviteToken!)}&session=session-metrics`,
    });
    expect(publicPage.statusCode).toBe(200);
    await expect(app.prisma.reviewAcquisitionInvite.findUniqueOrThrow({ where: { id: storedInvite.id } })).resolves.toMatchObject({ status: 'OPENED' });

    const targetId = publicPage.json().campaign.publicReviewTargets[0].id as string;
    const click = await app.inject({
      method: 'GET',
      url: `/api/v1/public/review-acquisition/${campaign.publicSlug}/targets/${targetId}?invite=${encodeURIComponent(inviteToken!)}&session=session-metrics`,
    });
    expect(click.statusCode).toBe(302);
    expect(click.headers.location).toBe('https://www.google.com/maps');

    const feedback = await app.inject({
      method: 'POST',
      url: `/api/v1/public/review-acquisition/${campaign.publicSlug}/feedback`,
      payload: { rating: 5, text: 'Отлично', consentToContact: false, invite: inviteToken, session: 'session-metrics' },
    });
    expect(feedback.statusCode).toBe(201);
    await expect(app.prisma.reviewAcquisitionInvite.findUniqueOrThrow({ where: { id: storedInvite.id } })).resolves.toMatchObject({ status: 'CONVERTED' });

    const metrics = await app.inject({
      method: 'GET',
      url: `/api/v1/acquisition/campaigns/${campaign.id}/metrics`,
      headers: { cookie },
    });
    expect(metrics.statusCode).toBe(200);
    expect(metrics.json()).toMatchObject({
      views: 1,
      feedbackSubmitted: 1,
      publicReviewTargetClicks: 1,
      averageFirstPartyRating: 5,
      casesOpened: 0,
    });
    expect(metrics.json().feedbackConversion).toBeGreaterThan(0);
    expect(metrics.json().publicReviewClickConversion).toBeGreaterThan(0);
  });

  it('does not expose inactive campaigns through the public surface', async () => {
    const campaign = await createCampaign({ active: false });
    const response = await app.inject({ method: 'GET', url: `/api/v1/public/review-acquisition/${campaign.publicSlug}` });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'ACQUISITION_CAMPAIGN_NOT_AVAILABLE' } });
  });
});
