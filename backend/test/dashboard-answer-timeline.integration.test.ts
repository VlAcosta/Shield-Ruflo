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
  throw new Error('Dashboard answer timeline tests require a test-only PostgreSQL database');
}

describeWithPostgres('Dashboard published answer timeline', () => {
  let app: FastifyInstance;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const sessionToken = `dashboard-answers-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'Answer Timeline A', slug: `answer-a-${randomUUID()}`, timezone: 'Europe/Moscow' },
        { id: organizationBId, name: 'Answer Timeline B', slug: `answer-b-${randomUUID()}`, timezone: 'Europe/Moscow' },
      ],
    });
    await app.prisma.user.create({
      data: {
        id: userAId,
        phone: `+7${Date.now()}81`,
        displayName: 'Answer Timeline Owner',
        profileCompletedAt: new Date(),
      },
    });
    await app.prisma.organizationMember.create({
      data: { organizationId: organizationAId, userId: userAId, role: 'OWNER', status: 'ACTIVE' },
    });
    await app.prisma.session.create({
      data: {
        userId: userAId,
        activeOrganizationId: organizationAId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 15 * 60_000),
      },
    });

    for (const [organizationId, suffix] of [[organizationAId, 'a'], [organizationBId, 'b']] as const) {
      const business = await app.prisma.business.create({
        data: { organizationId, name: `Answer Business ${suffix}`, isPrimary: true },
      });
      const source = await app.prisma.reviewSource.create({
        data: { organizationId, businessId: business.id, provider: `answer-${suffix}`, name: `Answer Source ${suffix}` },
      });
      await app.prisma.review.create({
        data: {
          organizationId,
          businessId: business.id,
          sourceId: source.id,
          externalId: `answer-${suffix}-${randomUUID()}`,
          rating: 5,
          text: `Published reply tenant ${suffix}`,
          workflowStatus: 'PUBLISHED',
          status: 'DONE',
          receivedAt: new Date(),
          repliedAt: new Date(),
        },
      });
    }
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await app.prisma.user.deleteMany({ where: { id: userAId } });
    await app.close();
  });

  it('returns exact published-answer counts for the active tenant only', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/dashboard/overview',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);

    const payload = response.json();
    expect(payload.reviews.month.labels).toHaveLength(28);
    expect(payload.reviews.month.answered).toHaveLength(28);
    expect(payload.reviews.month.answered.reduce((sum: number, value: number) => sum + value, 0)).toBe(1);
    expect(payload.reviews.week.labels).toHaveLength(7);
    expect(payload.reviews.week.answered.reduce((sum: number, value: number) => sum + value, 0)).toBe(1);
    expect(payload.reviews.week.received.reduce((sum: number, value: number) => sum + value, 0)).toBe(1);
  });
});
