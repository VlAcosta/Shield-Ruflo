import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';
import { provisionTestPlan } from './support/plan-fixtures.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P10 integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('Operations P10 tenant isolation and permissions', () => {
  let app: FastifyInstance;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const ownerAId = randomUUID();
  const analystAId = randomUUID();
  const ownerBId = randomUUID();
  const ownerSessionToken = `p10-owner-${randomUUID()}`;
  const analystSessionToken = `p10-analyst-${randomUUID()}`;
  const ownerCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(ownerSessionToken)}`;
  const analystCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(analystSessionToken)}`;
  const foreignAutomationId = randomUUID();
  const foreignReportId = randomUUID();
  const foreignNotificationId = randomUUID();

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'P10 Organization A', slug: `p10-a-${randomUUID()}` },
        { id: organizationBId, name: 'P10 Organization B', slug: `p10-b-${randomUUID()}` },
      ],
    });
    await provisionTestPlan(app, [organizationAId, organizationBId], 'PRO');
    await app.prisma.user.createMany({
      data: [
        { id: ownerAId, phone: `+7${Date.now()}31`, displayName: 'P10 Owner A', profileCompletedAt: new Date() },
        { id: analystAId, phone: `+7${Date.now()}32`, displayName: 'P10 Analyst A', profileCompletedAt: new Date() },
        { id: ownerBId, phone: `+7${Date.now()}33`, displayName: 'P10 Owner B', profileCompletedAt: new Date() },
      ],
    });
    await app.prisma.organizationMember.createMany({
      data: [
        { organizationId: organizationAId, userId: ownerAId, role: 'OWNER', status: 'ACTIVE' },
        { organizationId: organizationAId, userId: analystAId, role: 'ANALYST', status: 'ACTIVE' },
        { organizationId: organizationBId, userId: ownerBId, role: 'OWNER', status: 'ACTIVE' },
      ],
    });
    await app.prisma.session.createMany({
      data: [
        {
          userId: ownerAId,
          activeOrganizationId: organizationAId,
          tokenHash: hashSessionToken(ownerSessionToken),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
        {
          userId: analystAId,
          activeOrganizationId: organizationAId,
          tokenHash: hashSessionToken(analystSessionToken),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
      ],
    });
    await app.prisma.automation.create({
      data: {
        id: foreignAutomationId,
        organizationId: organizationBId,
        name: 'Foreign automation',
        trigger: 'new_review',
        conditions: {},
        actions: ['notify'],
      },
    });
    await app.prisma.report.create({
      data: {
        id: foreignReportId,
        organizationId: organizationBId,
        type: 'custom',
        title: 'Foreign report',
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-08-08T00:00:00.000Z'),
        status: 'READY',
        data: { measured: true },
      },
    });
    await app.prisma.notification.create({
      data: {
        id: foreignNotificationId,
        organizationId: organizationBId,
        userId: ownerBId,
        type: 'security',
        title: 'Foreign notification',
        body: 'Must remain private',
      },
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [ownerAId, analystAId, ownerBId] } } });
    await app.close();
  });

  it('persists automation description and does not expose foreign automations', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/automations',
      headers: { cookie: ownerCookie },
      payload: {
        name: 'Негативный отзыв',
        description: 'Создавать внутреннее действие при негативном отзыве',
        trigger: 'new_review',
        conditions: { ratingMax: 2 },
        actions: ['notify'],
        enabled: true,
      },
    });
    expect(create.statusCode).toBe(201);
    const automationId = create.json().automation.id as string;
    expect(create.json().automation.conditions).toMatchObject({
      ratingMax: 2,
      __description: 'Создавать внутреннее действие при негативном отзыве',
    });

    const list = await app.inject({ method: 'GET', url: '/api/v1/automations', headers: { cookie: ownerCookie } });
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).toContain(automationId);
    expect(JSON.stringify(list.json())).not.toContain(foreignAutomationId);
    expect(JSON.stringify(list.json())).not.toContain('Foreign automation');

    const patchForeign = await app.inject({
      method: 'PATCH',
      url: `/api/v1/automations/${foreignAutomationId}`,
      headers: { cookie: ownerCookie },
      payload: { enabled: false },
    });
    expect(patchForeign.statusCode).toBe(404);
    expect(patchForeign.json()).toMatchObject({ error: { code: 'AUTOMATION_NOT_FOUND' } });
    await expect(app.prisma.automation.findUniqueOrThrow({ where: { id: foreignAutomationId } }))
      .resolves.toMatchObject({ enabled: true });
  });

  it('separates report read and create permissions and hides foreign reports', async () => {
    const analystList = await app.inject({ method: 'GET', url: '/api/v1/reports', headers: { cookie: analystCookie } });
    expect(analystList.statusCode).toBe(200);
    expect(JSON.stringify(analystList.json())).not.toContain(foreignReportId);
    expect(JSON.stringify(analystList.json())).not.toContain('Foreign report');

    const analystCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { cookie: analystCookie },
      payload: {
        type: 'custom',
        title: 'Analyst must not create this',
        periodStart: '2026-08-01T00:00:00.000Z',
        periodEnd: '2026-08-08T00:00:00.000Z',
      },
    });
    expect(analystCreate.statusCode).toBe(403);

    const ownerCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { cookie: ownerCookie },
      payload: {
        type: 'weekly_reputation',
        title: 'Weekly reputation report',
        periodStart: '2026-08-01T00:00:00.000Z',
        periodEnd: '2026-08-08T00:00:00.000Z',
      },
    });
    expect(ownerCreate.statusCode).toBe(202);
    const reportId = ownerCreate.json().report.id as string;
    await expect(app.prisma.job.findFirstOrThrow({ where: { organizationId: organizationAId, type: 'report.generate', payload: { path: ['reportId'], equals: reportId } } }))
      .resolves.toMatchObject({ status: 'QUEUED', maxAttempts: 3 });
    await expect(app.prisma.auditLog.findFirstOrThrow({ where: { organizationId: organizationAId, action: 'report.created', entityId: reportId } }))
      .resolves.toMatchObject({ actorUserId: ownerAId });

    const foreign = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/${foreignReportId}`,
      headers: { cookie: ownerCookie },
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toMatchObject({ error: { code: 'REPORT_NOT_FOUND' } });
  });

  it('keeps notifications tenant and recipient scoped', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/notifications', headers: { cookie: ownerCookie } });
    expect(list.statusCode).toBe(200);
    expect(JSON.stringify(list.json())).not.toContain(foreignNotificationId);
    expect(JSON.stringify(list.json())).not.toContain('Foreign notification');

    const markForeign = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${foreignNotificationId}/read`,
      headers: { cookie: ownerCookie },
    });
    expect(markForeign.statusCode).toBe(404);
    expect(markForeign.json()).toMatchObject({ error: { code: 'NOTIFICATION_NOT_FOUND' } });
    await expect(app.prisma.notification.findUniqueOrThrow({ where: { id: foreignNotificationId } }))
      .resolves.toMatchObject({ status: 'UNREAD', readAt: null });
  });
});
