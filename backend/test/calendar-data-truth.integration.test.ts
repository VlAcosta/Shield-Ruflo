import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createOpaqueToken, hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|p1|p26|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Calendar integration tests require NODE_ENV=test and a matching test-only TEST_DATABASE_URL/DATABASE_URL');
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function uniquePhone(suffix: number): string {
  return `+77${String(Date.now()).slice(-8)}${suffix}`;
}

describeWithPostgres('dashboard calendar data truth', () => {
  let app: FastifyInstance;
  const organizationIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (!app) return;
    if (organizationIds.length) {
      await app.prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    }
    if (userIds.length) {
      await app.prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app.close();
  });

  it('persists shared events, enforces RBAC and tenant isolation, and deduplicates create requests', async () => {
    const owner = await app.prisma.user.create({ data: { phone: uniquePhone(1), displayName: 'Calendar Owner' } });
    const analyst = await app.prisma.user.create({ data: { phone: uniquePhone(2), displayName: 'Calendar Analyst' } });
    const otherOwner = await app.prisma.user.create({ data: { phone: uniquePhone(3), displayName: 'Other Calendar Owner' } });
    userIds.push(owner.id, analyst.id, otherOwner.id);

    const organization = await app.prisma.organization.create({
      data: {
        name: 'Calendar Workspace',
        slug: `calendar-${randomUUID()}`,
        members: {
          create: [
            { userId: owner.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
            { userId: analyst.id, role: 'ANALYST', status: 'ACTIVE', joinedAt: new Date() },
          ],
        },
      },
    });
    const otherOrganization = await app.prisma.organization.create({
      data: {
        name: 'Other Calendar Workspace',
        slug: `calendar-other-${randomUUID()}`,
        members: { create: { userId: otherOwner.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } },
      },
    });
    organizationIds.push(organization.id, otherOrganization.id);

    const ownerToken = createOpaqueToken();
    const analystToken = createOpaqueToken();
    const otherToken = createOpaqueToken();
    await app.prisma.session.createMany({
      data: [
        { userId: owner.id, activeOrganizationId: organization.id, tokenHash: hashSessionToken(ownerToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
        { userId: analyst.id, activeOrganizationId: organization.id, tokenHash: hashSessionToken(analystToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
        { userId: otherOwner.id, activeOrganizationId: otherOrganization.id, tokenHash: hashSessionToken(otherToken), expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
      ],
    });

    const analystBefore = await app.inject({ method: 'GET', url: '/api/v1/calendar/events', headers: bearer(analystToken) });
    expect(analystBefore.statusCode).toBe(200);
    expect(analystBefore.json()).toEqual({ items: [] });

    const analystCreate = await app.inject({
      method: 'POST',
      url: '/api/v1/calendar/events',
      headers: { ...bearer(analystToken), 'idempotency-key': 'calendar-analyst-forbidden' },
      payload: { title: 'Forbidden', date: '2026-08-20', time: '10:00', type: 'work', tone: 'violet', note: '' },
    });
    expect(analystCreate.statusCode).toBe(403);

    const idempotencyKey = `calendar-${randomUUID()}`;
    const payload = {
      title: 'Weekly reputation review',
      date: '2026-08-21',
      time: '11:30',
      type: 'meeting',
      tone: 'green',
      note: 'Review SLA and unresolved feedback',
    };

    const createdResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/calendar/events',
      headers: { ...bearer(ownerToken), 'idempotency-key': idempotencyKey },
      payload,
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = createdResponse.json().event;
    expect(created).toMatchObject(payload);
    expect(created.id).toEqual(expect.any(String));

    const replayResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/calendar/events',
      headers: { ...bearer(ownerToken), 'idempotency-key': idempotencyKey },
      payload,
    });
    expect(replayResponse.statusCode).toBe(201);
    expect(replayResponse.json().event.id).toBe(created.id);
    expect(await app.prisma.calendarEvent.count({ where: { organizationId: organization.id } })).toBe(1);

    const analystAfter = await app.inject({ method: 'GET', url: '/api/v1/calendar/events', headers: bearer(analystToken) });
    expect(analystAfter.statusCode).toBe(200);
    expect(analystAfter.json().items).toHaveLength(1);
    expect(analystAfter.json().items[0]).toMatchObject({ id: created.id, title: payload.title, date: payload.date });

    const crossTenantDelete = await app.inject({
      method: 'DELETE',
      url: `/api/v1/calendar/events/${created.id}`,
      headers: bearer(otherToken),
    });
    expect(crossTenantDelete.statusCode).toBe(404);

    const deleteResponse = await app.inject({
      method: 'DELETE',
      url: `/api/v1/calendar/events/${created.id}`,
      headers: bearer(ownerToken),
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ deleted: true });
    expect(await app.prisma.calendarEvent.count({ where: { organizationId: organization.id } })).toBe(0);

    const auditRows = await app.prisma.auditLog.findMany({
      where: { organizationId: organization.id, entityType: 'calendar_event', entityId: created.id },
      select: { action: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(auditRows.map((row) => row.action)).toEqual(['calendar.event.created', 'calendar.event.deleted']);
  });
});
