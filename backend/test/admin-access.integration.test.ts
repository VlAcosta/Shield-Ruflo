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
const configuredAdminIdentity = env.PLATFORM_ADMIN_IDENTITIES[0] ?? '';
const describeWithPostgres = integrationDatabaseUrl && configuredAdminIdentity ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Admin integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('Platform admin access gate', () => {
  let app: FastifyInstance;
  const adminUserId = randomUUID();
  const regularUserId = randomUUID();
  const adminSessionToken = `admin-access-${randomUUID()}`;
  const regularSessionToken = `regular-access-${randomUUID()}`;
  const adminCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(adminSessionToken)}`;
  const regularCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(regularSessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();

    const adminUsesEmail = configuredAdminIdentity.includes('@');
    await app.prisma.user.createMany({
      data: [
        {
          id: adminUserId,
          phone: adminUsesEmail ? `+7${Date.now()}41` : configuredAdminIdentity,
          email: adminUsesEmail ? configuredAdminIdentity : `admin-${randomUUID()}@example.test`,
          displayName: 'Platform Admin',
          profileCompletedAt: new Date(),
        },
        {
          id: regularUserId,
          phone: `+7${Date.now()}42`,
          email: `regular-${randomUUID()}@example.test`,
          displayName: 'Regular User',
          profileCompletedAt: new Date(),
        },
      ],
    });

    await app.prisma.session.createMany({
      data: [
        {
          userId: adminUserId,
          tokenHash: hashSessionToken(adminSessionToken),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
        {
          userId: regularUserId,
          tokenHash: hashSessionToken(regularSessionToken),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.user.deleteMany({ where: { id: { in: [adminUserId, regularUserId] } } });
    await app.close();
  });

  it('requires a valid HttpOnly session before checking platform-admin identity', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/admin/access' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });

  it('allows only an authenticated identity present in the server allowlist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/access',
      headers: { cookie: adminCookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ allowed: true });
    expect(JSON.stringify(response.json())).not.toContain(configuredAdminIdentity);
  });

  it('denies a normal authenticated organization user without leaking the allowlist', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/access',
      headers: { cookie: regularCookie },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: 'PLATFORM_ADMIN_ACCESS_DENIED',
        message: 'Доступ к панели администратора запрещён',
      },
    });
    expect(JSON.stringify(response.json())).not.toContain(configuredAdminIdentity);
  });
});
