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

    const idempotencyKey = `report-create-${randomUUID()}`;
    const createPayload = {
      type: 'weekly_reputation',
      title: 'Weekly reputation report',
      periodStart: '2026-08-01T00:00:00.000Z',
      periodEnd: '2026-08-08T00:00:00.000Z',
      requestedBlocks: ['rating', 'reviews', 'tasks', 'recommendations'],
    };
    const ownerCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { cookie: ownerCookie, 'idempotency-key': idempotencyKey },
      payload: createPayload,
    });
    expect(ownerCreate.statusCode).toBe(202);
    const reportId = ownerCreate.json().report.id as string;

    const repeatedCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { cookie: ownerCookie, 'idempotency-key': idempotencyKey },
      payload: createPayload,
    });
    expect(repeatedCreate.statusCode).toBe(202);
    expect(repeatedCreate.json().report.id).toBe(reportId);

    const generationJob = await app.prisma.job.findFirstOrThrow({
      where: {
        organizationId: organizationAId,
        type: 'report.generate',
        dedupeKey: `report.manual:${idempotencyKey}`,
      },
    });
    expect(generationJob).toMatchObject({ status: 'QUEUED', maxAttempts: 3 });
    expect(generationJob.payload).toMatchObject({
      reportId,
      requestedBlocks: ['rating', 'reviews', 'tasks', 'recommendations'],
    });
    await expect(app.prisma.report.count({
      where: {
        organizationId: organizationAId,
        type: 'weekly_reputation',
        periodStart: new Date('2026-08-01T00:00:00.000Z'),
        periodEnd: new Date('2026-08-08T00:00:00.000Z'),
      },
    })).resolves.toBe(1);
    await expect(app.prisma.auditLog.findFirstOrThrow({ where: { organizationId: organizationAId, action: 'report.created', entityId: reportId } }))
      .resolves.toMatchObject({ actorUserId: ownerAId });

    const unsupportedBlock = await app.inject({
      method: 'POST',
      url: '/api/v1/reports',
      headers: { cookie: ownerCookie },
      payload: {
        ...createPayload,
        title: 'Invalid report blocks',
        requestedBlocks: ['rating', 'server-secrets'],
      },
    });
    expect(unsupportedBlock.statusCode).toBe(400);

    const unavailableDelivery = await app.inject({
      method: 'PUT',
      url: '/api/v1/reports/schedules',
      headers: { cookie: ownerCookie },
      payload: {
        schedules: [{
          id: 'weekly-email',
          title: 'Weekly delivery',
          day: 'mon',
          dayLabel: 'Пн',
          time: '09:00',
          channel: 'email',
          channelLabel: 'Email',
          destination: 'owner@example.test',
          enabled: true,
        }],
      },
    });
    expect(unavailableDelivery.statusCode).toBe(409);
    expect(unavailableDelivery.json().error.code).toBe('REPORT_EMAIL_PROVIDER_NOT_CONFIGURED');

    const foreign = await app.inject({
      method: 'GET',
      url: `/api/v1/reports/${foreignReportId}`,
      headers: { cookie: ownerCookie },
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toMatchObject({ error: { code: 'REPORT_NOT_FOUND' } });
  });

  it('keeps notifications tenant and recipient scoped with independent read state', async () => {
    const ownerNotification = await app.prisma.notification.create({
      data: {
        organizationId: organizationAId,
        userId: ownerAId,
        type: 'tasks',
        title: 'Owner only notification',
        body: 'Visible only to owner A',
      },
    });
    const analystNotification = await app.prisma.notification.create({
      data: {
        organizationId: organizationAId,
        userId: analystAId,
        type: 'tasks',
        title: 'Analyst only notification',
        body: 'Visible only to analyst A',
      },
    });
    const legacyGlobal = await app.prisma.notification.create({
      data: {
        organizationId: organizationAId,
        userId: null,
        type: 'system',
        title: 'Legacy global notification',
        body: 'Must not use shared read state',
      },
    });

    const list = await app.inject({ method: 'GET', url: '/api/v1/notifications', headers: { cookie: ownerCookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      version: 1,
      source: 'api',
      preferences: { activeTab: 'unread', activeType: 'all' },
      settings: {
        channels: { email: false, telegram: false, push: false, sms: false },
        events: {
          review: true,
          overdueTask: true,
          completedTask: true,
          reportReady: true,
          message: true,
          subscription: true,
        },
        quietHours: { enabled: false, from: '22:00', to: '09:00' },
      },
    });
    const serialized = JSON.stringify(list.json());
    expect(serialized).toContain(ownerNotification.id);
    expect(serialized).not.toContain(analystNotification.id);
    expect(serialized).not.toContain(legacyGlobal.id);
    expect(serialized).not.toContain(foreignNotificationId);
    expect(serialized).not.toContain('Foreign notification');

    const read = await app.inject({
      method: 'PATCH',
      url: `/api/v1/notifications/${ownerNotification.id}/read`,
      headers: { cookie: ownerCookie },
    });
    expect(read.statusCode).toBe(200);
    await expect(app.prisma.notification.findUniqueOrThrow({ where: { id: ownerNotification.id } }))
      .resolves.toMatchObject({ status: 'READ' });
    await expect(app.prisma.notification.findUniqueOrThrow({ where: { id: analystNotification.id } }))
      .resolves.toMatchObject({ status: 'UNREAD', readAt: null });
    await expect(app.prisma.notification.findUniqueOrThrow({ where: { id: legacyGlobal.id } }))
      .resolves.toMatchObject({ status: 'UNREAD', readAt: null });

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

  it('deep-merges strict notification preferences and refuses fake delivery channels', async () => {
    const typePreference = await app.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/preferences',
      headers: { cookie: ownerCookie },
      payload: { activeType: 'tasks' },
    });
    expect(typePreference.statusCode).toBe(200);
    expect(typePreference.json().preferences).toEqual({ activeTab: 'unread', activeType: 'tasks' });

    const eventSettings = await app.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/settings',
      headers: { cookie: ownerCookie },
      payload: { events: { review: false }, quietHours: { enabled: true } },
    });
    expect(eventSettings.statusCode).toBe(200);
    expect(eventSettings.json().settings).toMatchObject({
      channels: { email: false, telegram: false, push: false, sms: false },
      events: { review: false, completedTask: true, reportReady: true, message: true },
      quietHours: { enabled: true, from: '22:00', to: '09:00' },
    });

    const quietHours = await app.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/settings',
      headers: { cookie: ownerCookie },
      payload: { quietHours: { from: '23:15' } },
    });
    expect(quietHours.statusCode).toBe(200);
    expect(quietHours.json().settings.quietHours).toEqual({ enabled: true, from: '23:15', to: '09:00' });

    const unsupportedChannel = await app.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/settings',
      headers: { cookie: ownerCookie },
      payload: { channels: { email: true } },
    });
    expect(unsupportedChannel.statusCode).toBe(409);
    expect(unsupportedChannel.json()).toMatchObject({
      error: { code: 'NOTIFICATION_CHANNEL_NOT_CONFIGURED' },
    });

    const malformed = await app.inject({
      method: 'PATCH',
      url: '/api/v1/notifications/settings',
      headers: { cookie: ownerCookie },
      payload: { quietHours: { from: '99:99' }, unexpected: true },
    });
    expect(malformed.statusCode).toBe(400);

    const persisted = await app.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: { cookie: ownerCookie },
    });
    expect(persisted.statusCode).toBe(200);
    expect(persisted.json()).toMatchObject({
      preferences: { activeTab: 'unread', activeType: 'tasks' },
      settings: {
        channels: { email: false, telegram: false, push: false, sms: false },
        events: { review: false, completedTask: true },
        quietHours: { enabled: true, from: '23:15', to: '09:00' },
      },
    });
  });
});
