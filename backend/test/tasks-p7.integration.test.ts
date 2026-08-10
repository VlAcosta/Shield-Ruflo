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
  throw new Error('P7 integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('Tasks API tenant isolation and durable preferences', () => {
  let app: FastifyInstance;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const teammateAId = randomUUID();
  const userBId = randomUUID();
  const taskAId = randomUUID();
  const taskBId = randomUUID();
  let memberAId = '';
  let teammateMemberAId = '';
  let memberBId = '';
  let businessAId = '';
  const sessionToken = `p7-integration-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();

    await app.prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'P7 Organization A', slug: `p7-a-${randomUUID()}` },
        { id: organizationBId, name: 'P7 Organization B', slug: `p7-b-${randomUUID()}` },
      ],
    });
    await app.prisma.user.createMany({
      data: [
        { id: userAId, phone: `+7${Date.now()}11`, displayName: 'P7 Owner A', profileCompletedAt: new Date() },
        { id: teammateAId, phone: `+7${Date.now()}12`, displayName: 'P7 Teammate A', profileCompletedAt: new Date() },
        { id: userBId, phone: `+7${Date.now()}13`, displayName: 'P7 Owner B', profileCompletedAt: new Date() },
      ],
    });

    const ownerA = await app.prisma.organizationMember.create({
      data: { organizationId: organizationAId, userId: userAId, role: 'OWNER', status: 'ACTIVE' },
    });
    const teammateA = await app.prisma.organizationMember.create({
      data: { organizationId: organizationAId, userId: teammateAId, role: 'MEMBER', status: 'ACTIVE' },
    });
    const ownerB = await app.prisma.organizationMember.create({
      data: { organizationId: organizationBId, userId: userBId, role: 'OWNER', status: 'ACTIVE' },
    });
    memberAId = ownerA.id;
    teammateMemberAId = teammateA.id;
    memberBId = ownerB.id;

    const businessA = await app.prisma.business.create({
      data: { organizationId: organizationAId, name: 'P7 Business A', isPrimary: true },
    });
    businessAId = businessA.id;

    await app.prisma.task.createMany({
      data: [
        {
          id: taskAId,
          organizationId: organizationAId,
          createdByUserId: userAId,
          title: 'Organization A task',
          status: 'NEW',
          priority: 'MEDIUM',
        },
        {
          id: taskBId,
          organizationId: organizationBId,
          createdByUserId: userBId,
          title: 'Organization B private task',
          status: 'NEW',
          priority: 'HIGH',
        },
      ],
    });

    await app.prisma.session.create({
      data: {
        userId: userAId,
        activeOrganizationId: organizationAId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.serviceMetadata.deleteMany({ where: { key: { startsWith: `task.preferences:${organizationAId}:` } } });
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userAId, teammateAId, userBId] } } });
    await app.close();
  });

  it('lists only the active tenant and persists per-user task view preferences', async () => {
    const list = await app.inject({ method: 'GET', url: '/api/v1/tasks', headers: { cookie } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({
      preferences: { view: 'board' },
      tasks: [{ id: taskAId, title: 'Organization A task' }],
    });
    expect(JSON.stringify(list.json())).not.toContain(taskBId);
    expect(JSON.stringify(list.json())).not.toContain('Organization B private task');

    const preference = await app.inject({
      method: 'PATCH',
      url: '/api/v1/tasks/preferences',
      headers: { cookie },
      payload: { view: 'list' },
    });
    expect(preference.statusCode).toBe(200);
    expect(preference.json()).toEqual({ preferences: { view: 'list' } });

    const afterReload = await app.inject({ method: 'GET', url: '/api/v1/tasks', headers: { cookie } });
    expect(afterReload.statusCode).toBe(200);
    expect(afterReload.json().preferences).toEqual({ view: 'list' });
  });

  it('updates scoped relations and assignees instead of silently ignoring them', async () => {
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${taskAId}`,
      headers: { cookie },
      payload: {
        businessId: businessAId,
        assigneeMemberIds: [memberAId, teammateMemberAId],
        priority: 'high',
      },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().task).toMatchObject({
      id: taskAId,
      businessId: businessAId,
      priority: 'high',
    });
    expect(update.json().task.assignees.map((item: { memberId: string }) => item.memberId).sort())
      .toEqual([memberAId, teammateMemberAId].sort());

    await expect(app.prisma.task.findUniqueOrThrow({ where: { id: taskAId } }))
      .resolves.toMatchObject({ businessId: businessAId, priority: 'HIGH' });
    await expect(app.prisma.taskAssignee.count({ where: { taskId: taskAId } })).resolves.toBe(2);
  });

  it('returns 404 and performs no write for cross-tenant task and member identifiers', async () => {
    const taskBBefore = await app.prisma.task.findUniqueOrThrow({ where: { id: taskBId } });

    const crossTenantTask = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${taskBId}`,
      headers: { cookie },
      payload: { title: 'Cross tenant overwrite' },
    });
    expect(crossTenantTask.statusCode).toBe(404);
    expect(crossTenantTask.json()).toMatchObject({ error: { code: 'TASK_NOT_FOUND' } });

    const foreignAssignee = await app.inject({
      method: 'PATCH',
      url: `/api/v1/tasks/${taskAId}`,
      headers: { cookie },
      payload: { assigneeMemberIds: [memberBId] },
    });
    expect(foreignAssignee.statusCode).toBe(404);
    expect(foreignAssignee.json()).toMatchObject({ error: { code: 'TEAM_MEMBER_NOT_FOUND' } });

    const taskBAfter = await app.prisma.task.findUniqueOrThrow({ where: { id: taskBId } });
    expect(taskBAfter).toMatchObject({ title: taskBBefore.title, updatedAt: taskBBefore.updatedAt });
    await expect(app.prisma.taskAssignee.count({ where: { taskId: taskAId } })).resolves.toBe(2);
  });
});
