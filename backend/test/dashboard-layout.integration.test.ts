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
  throw new Error('Dashboard layout integration tests require an explicit test-only PostgreSQL database');
}

const layoutA = {
  version: 7,
  preferences: { density: 'compact' as const },
  order: ['reviews', 'tasks'] as const,
  widgets: {
    reviews: { visible: true, span: 8 },
    tasks: { visible: false, span: 4 },
  },
};

const layoutB = {
  version: 7,
  preferences: { density: 'comfortable' as const },
  order: ['rating'] as const,
  widgets: {
    rating: { visible: true, span: 6 },
  },
};

describeWithPostgres('Dashboard persisted layout API', () => {
  let app: FastifyInstance;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userId = randomUUID();
  const sessionId = randomUUID();
  const sessionToken = `dashboard-layout-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'Dashboard Layout A', slug: `layout-a-${randomUUID()}` },
        { id: organizationBId, name: 'Dashboard Layout B', slug: `layout-b-${randomUUID()}` },
      ],
    });
    await app.prisma.user.create({
      data: {
        id: userId,
        phone: `+7${Date.now()}73`,
        displayName: 'Dashboard Layout Owner',
        profileCompletedAt: new Date(),
      },
    });
    await app.prisma.organizationMember.createMany({
      data: [
        { organizationId: organizationAId, userId, role: 'OWNER', status: 'ACTIVE' },
        { organizationId: organizationBId, userId, role: 'OWNER', status: 'ACTIVE' },
      ],
    });
    await app.prisma.session.create({
      data: {
        id: sessionId,
        userId,
        activeOrganizationId: organizationAId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 20 * 60_000),
      },
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await app.prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('starts empty, persists a layout and rejects unknown widgets', async () => {
    const empty = await app.inject({ method: 'GET', url: '/api/v1/dashboard/layout', headers: { cookie } });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toMatchObject({ layout: null, version: null, updatedAt: null });

    const saved = await app.inject({
      method: 'PUT',
      url: '/api/v1/dashboard/layout',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { layout: layoutA },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({ layout: layoutA, version: 7 });
    expect(saved.json().updatedAt).toEqual(expect.any(String));

    const readBack = await app.inject({ method: 'GET', url: '/api/v1/dashboard/layout', headers: { cookie } });
    expect(readBack.statusCode).toBe(200);
    expect(readBack.json().layout).toEqual(layoutA);

    const invalid = await app.inject({
      method: 'PUT',
      url: '/api/v1/dashboard/layout',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        layout: {
          version: 7,
          preferences: { density: 'comfortable' },
          order: ['reviews'],
          widgets: {
            reviews: { visible: true, span: 7 },
            admin_backdoor: { visible: true, span: 12 },
          },
        },
      },
    });
    expect(invalid.statusCode).toBe(400);
  });

  it('keeps layouts isolated by active organization for the same user', async () => {
    await app.prisma.session.update({
      where: { id: sessionId },
      data: { activeOrganizationId: organizationBId },
    });

    const emptyB = await app.inject({ method: 'GET', url: '/api/v1/dashboard/layout', headers: { cookie } });
    expect(emptyB.statusCode).toBe(200);
    expect(emptyB.json().layout).toBeNull();

    const savedB = await app.inject({
      method: 'PUT',
      url: '/api/v1/dashboard/layout',
      headers: { cookie, 'content-type': 'application/json' },
      payload: { layout: layoutB },
    });
    expect(savedB.statusCode).toBe(200);
    expect(savedB.json().layout).toEqual(layoutB);

    await app.prisma.session.update({
      where: { id: sessionId },
      data: { activeOrganizationId: organizationAId },
    });

    const readA = await app.inject({ method: 'GET', url: '/api/v1/dashboard/layout', headers: { cookie } });
    expect(readA.statusCode).toBe(200);
    expect(readA.json().layout).toEqual(layoutA);

    const resetA = await app.inject({ method: 'DELETE', url: '/api/v1/dashboard/layout', headers: { cookie } });
    expect(resetA.statusCode).toBe(200);
    expect(resetA.json()).toEqual({ reset: true });

    const afterResetA = await app.inject({ method: 'GET', url: '/api/v1/dashboard/layout', headers: { cookie } });
    expect(afterResetA.json().layout).toBeNull();

    await app.prisma.session.update({
      where: { id: sessionId },
      data: { activeOrganizationId: organizationBId },
    });
    const readBAfterResetA = await app.inject({ method: 'GET', url: '/api/v1/dashboard/layout', headers: { cookie } });
    expect(readBAfterResetA.json().layout).toEqual(layoutB);
  });
});
