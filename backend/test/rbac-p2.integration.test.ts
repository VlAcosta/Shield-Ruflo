import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';
import { createTeamInvitation, updateTeamMember } from '../src/modules/team/team.service.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p2|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P2 integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('P2 organization context and RBAC', () => {
  let app: FastifyInstance;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const organizationCId = randomUUID();
  const ownerAId = randomUUID();
  const ownerA2Id = randomUUID();
  const adminAId = randomUUID();
  const memberAId = randomUUID();
  const ownerBId = randomUUID();
  const memberIds: Record<string, string> = {};
  const tokens = {
    ownerA: `p2-owner-a-${randomUUID()}`,
    ownerA2: `p2-owner-a2-${randomUUID()}`,
    adminA: `p2-admin-a-${randomUUID()}`,
    memberA: `p2-member-a-${randomUUID()}`,
  };
  const cookie = (token: string) => `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`;

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.createMany({ data: [
      { id: organizationAId, name: 'P2 Organization A', slug: `p2-a-${randomUUID()}` },
      { id: organizationBId, name: 'P2 Organization B', slug: `p2-b-${randomUUID()}` },
      { id: organizationCId, name: 'P2 Organization C', slug: `p2-c-${randomUUID()}` },
    ] });
    const stamp = `${Date.now()}`;
    await app.prisma.user.createMany({ data: [
      { id: ownerAId, phone: `+711${stamp}01`, email: `owner-a-${stamp}@example.test` },
      { id: ownerA2Id, phone: `+711${stamp}02`, email: `owner-a2-${stamp}@example.test` },
      { id: adminAId, phone: `+711${stamp}03`, email: `admin-a-${stamp}@example.test` },
      { id: memberAId, phone: `+711${stamp}04`, email: `member-a-${stamp}@example.test` },
      { id: ownerBId, phone: `+711${stamp}05`, email: `owner-b-${stamp}@example.test` },
    ] });
    for (const membership of [
      { organizationId: organizationAId, userId: ownerAId, role: 'OWNER' as const },
      { organizationId: organizationAId, userId: ownerA2Id, role: 'OWNER' as const },
      { organizationId: organizationAId, userId: adminAId, role: 'ADMIN' as const },
      { organizationId: organizationAId, userId: memberAId, role: 'MEMBER' as const },
      { organizationId: organizationBId, userId: ownerBId, role: 'OWNER' as const },
      { organizationId: organizationCId, userId: memberAId, role: 'MEMBER' as const },
    ]) {
      const saved = await app.prisma.organizationMember.create({ data: { ...membership, status: 'ACTIVE' } });
      memberIds[membership.userId] ??= saved.id;
    }
    await app.prisma.session.createMany({ data: [
      { userId: ownerAId, activeOrganizationId: organizationAId, tokenHash: hashSessionToken(tokens.ownerA), expiresAt: new Date(Date.now() + 600_000) },
      { userId: ownerA2Id, activeOrganizationId: organizationAId, tokenHash: hashSessionToken(tokens.ownerA2), expiresAt: new Date(Date.now() + 600_000) },
      { userId: adminAId, activeOrganizationId: organizationAId, tokenHash: hashSessionToken(tokens.adminA), expiresAt: new Date(Date.now() + 600_000) },
      { userId: memberAId, activeOrganizationId: organizationAId, tokenHash: hashSessionToken(tokens.memberA), expiresAt: new Date(Date.now() + 600_000) },
    ] });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId, organizationCId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [ownerAId, ownerA2Id, adminAId, memberAId, ownerBId] } } });
    await app.close();
  });

  it('rejects switching to a foreign organization without revealing it', async () => {
    const response = await app.inject({
      method: 'POST', url: `/api/v1/organizations/${organizationBId}/select`, headers: { cookie: cookie(tokens.ownerA) },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'ORGANIZATION_NOT_FOUND' } });
  });

  it('persists a successful organization switch and writes its audit atomically', async () => {
    const response = await app.inject({
      method: 'POST', url: `/api/v1/organizations/${organizationCId}/select`, headers: { cookie: cookie(tokens.memberA) },
    });
    expect(response.statusCode).toBe(200);
    await expect(app.prisma.session.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(tokens.memberA) } }))
      .resolves.toMatchObject({ activeOrganizationId: organizationCId });
    await expect(app.prisma.auditLog.findFirst({
      where: { organizationId: organizationCId, actorUserId: memberAId, action: 'organization.selected' },
      orderBy: { createdAt: 'desc' },
    })).resolves.toMatchObject({ metadata: { switchedFromAnotherOrganization: true } });

    const restored = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: cookie(tokens.memberA) } });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({ organizationContext: { organizationId: organizationCId } });

    await app.prisma.session.update({
      where: { tokenHash: hashSessionToken(tokens.memberA) }, data: { activeOrganizationId: organizationAId },
    });
  });

  it('enforces server-side granular permissions', async () => {
    const response = await app.inject({
      method: 'PATCH', url: `/api/v1/organizations/${organizationAId}`,
      headers: { cookie: cookie(tokens.memberA) }, payload: { name: 'Forbidden rename' },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('prevents permission escalation and non-owner changes to owner policy', async () => {
    const escalation = await app.inject({
      method: 'PATCH', url: `/api/v1/team/members/${memberIds[adminAId]}`,
      headers: { cookie: cookie(tokens.adminA) },
      payload: { permissionOverrides: { allow: ['billing.manage'], deny: [] } },
    });
    expect(escalation.statusCode).toBe(403);
    expect(escalation.json()).toMatchObject({ error: { code: 'PERMISSION_NON_DELEGABLE' } });

    const ownerPolicy = await app.inject({
      method: 'PATCH', url: `/api/v1/team/members/${memberIds[ownerAId]}`,
      headers: { cookie: cookie(tokens.adminA) },
      payload: { permissionOverrides: { allow: [], deny: ['team.manage'] } },
    });
    expect(ownerPolicy.statusCode).toBe(403);
    expect(ownerPolicy.json()).toMatchObject({ error: { code: 'OWNER_PROTECTED' } });

    const foreignMember = await app.inject({
      method: 'PATCH', url: `/api/v1/team/members/${memberIds[ownerBId]}`,
      headers: { cookie: cookie(tokens.ownerA) }, payload: { role: 'MANAGER' },
    });
    expect(foreignMember.statusCode).toBe(404);
    expect(foreignMember.json()).toMatchObject({ error: { code: 'MEMBER_NOT_FOUND' } });
  });

  it('keeps owner-only permissions non-delegable for member updates and invitations', async () => {
    const memberUpdate = await app.inject({
      method: 'PATCH', url: `/api/v1/team/members/${memberIds[memberAId]}`,
      headers: { cookie: cookie(tokens.ownerA) },
      payload: { permissionOverrides: { allow: ['billing.manage'], deny: [] } },
    });
    expect(memberUpdate.statusCode).toBe(403);
    expect(memberUpdate.json()).toMatchObject({ error: { code: 'PERMISSION_NON_DELEGABLE' } });

    const invitation = await app.inject({
      method: 'POST', url: '/api/v1/team/invitations', headers: { cookie: cookie(tokens.ownerA) },
      payload: {
        name: 'Billing delegate', email: `delegate-${randomUUID()}@example.test`, role: 'MEMBER',
        permissionOverrides: { allow: ['billing.manage'], deny: [] },
      },
    });
    expect(invitation.statusCode).toBe(403);
    expect(invitation.json()).toMatchObject({ error: { code: 'PERMISSION_NON_DELEGABLE' } });
  });

  it('revalidates stale actor authority inside the organization lock', async () => {
    await app.prisma.organizationMember.update({
      where: { id: memberIds[adminAId] }, data: { permissionOverrides: { allow: [], deny: ['team.manage'] } },
    });
    const staleRequest = {
      auth: {
        membershipId: memberIds[adminAId], userId: adminAId, organizationId: organizationAId,
        role: 'ADMIN', permissions: ['team.manage'],
      },
    } as unknown as FastifyRequest;
    await expect(updateTeamMember(app, staleRequest, memberIds[memberAId], { role: 'ANALYST' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    await expect(createTeamInvitation(app, staleRequest, {
      name: 'Stale actor invite', email: `stale-${randomUUID()}@example.test`, role: 'MEMBER',
    })).rejects.toMatchObject({ code: 'FORBIDDEN', statusCode: 403 });
    await app.prisma.organizationMember.update({
      where: { id: memberIds[adminAId] }, data: { permissionOverrides: { allow: [], deny: [] } },
    });
  });

  it('prevents a non-owner from revoking owner sessions', async () => {
    const response = await app.inject({
      method: 'DELETE', url: `/api/v1/team/members/${memberIds[ownerAId]}/sessions`,
      headers: { cookie: cookie(tokens.adminA) },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'OWNER_PROTECTED' } });
    await expect(app.prisma.session.count({
      where: { userId: ownerAId, activeOrganizationId: organizationAId, revokedAt: null },
    })).resolves.toBe(1);
  });

  it('rejects sequential future expiries that would eventually leave no owner', async () => {
    const firstExpiry = new Date(Date.now() + 2 * 86_400_000);
    const laterExpiry = new Date(Date.now() + 3 * 86_400_000);
    const first = await app.inject({
      method: 'PATCH', url: `/api/v1/team/members/${memberIds[ownerA2Id]}`,
      headers: { cookie: cookie(tokens.ownerA) }, payload: { accessExpiresAt: firstExpiry.toISOString() },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'PATCH', url: `/api/v1/team/members/${memberIds[ownerAId]}`,
      headers: { cookie: cookie(tokens.ownerA2) }, payload: { accessExpiresAt: laterExpiry.toISOString() },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ error: { code: 'LAST_OWNER_REQUIRED' } });

    await app.prisma.organizationMember.update({
      where: { id: memberIds[ownerA2Id] }, data: { accessExpiresAt: null },
    });
  });

  it('serializes concurrent owner demotions and preserves one usable owner', async () => {
    const [first, second] = await Promise.all([
      app.inject({
        method: 'PATCH', url: `/api/v1/team/members/${memberIds[ownerA2Id]}`,
        headers: { cookie: cookie(tokens.ownerA) }, payload: { role: 'MANAGER' },
      }),
      app.inject({
        method: 'PATCH', url: `/api/v1/team/members/${memberIds[ownerAId]}`,
        headers: { cookie: cookie(tokens.ownerA2) }, payload: { role: 'MANAGER' },
      }),
    ]);
    expect([first.statusCode, second.statusCode].filter((status) => status === 200)).toHaveLength(1);
    expect([first.statusCode, second.statusCode].some((status) => status === 409 || status === 403)).toBe(true);
    await expect(app.prisma.organizationMember.count({
      where: { organizationId: organizationAId, role: 'OWNER', status: 'ACTIVE', OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: new Date() } }] },
    })).resolves.toBe(1);
  });

  it('does not permit an expiry policy that would eliminate the last usable owner', async () => {
    const owner = await app.prisma.organizationMember.findFirstOrThrow({
      where: { organizationId: organizationAId, role: 'OWNER', status: 'ACTIVE' },
      select: { id: true, userId: true },
    });
    const ownerToken = owner.userId === ownerAId ? tokens.ownerA : tokens.ownerA2;
    const response = await app.inject({
      method: 'PATCH', url: `/api/v1/team/members/${owner.id}`,
      headers: { cookie: cookie(ownerToken) },
      payload: { accessExpiresAt: new Date(Date.now() + 86_400_000).toISOString() },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'LAST_OWNER_REQUIRED' } });
  });

  it('clears an unusable selected organization instead of silently switching tenants', async () => {
    await app.prisma.organizationMember.update({
      where: { organizationId_userId: { organizationId: organizationAId, userId: memberAId } },
      data: { status: 'SUSPENDED', suspendedAt: new Date() },
    });
    const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: cookie(tokens.memberA) } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ organizationContext: null, user: { membership: null } });
    await expect(app.prisma.session.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(tokens.memberA) } }))
      .resolves.toMatchObject({ activeOrganizationId: null });

    const protectedResponse = await app.inject({ method: 'GET', url: '/api/v1/reviews', headers: { cookie: cookie(tokens.memberA) } });
    expect(protectedResponse.statusCode).toBe(409);
    expect(protectedResponse.json()).toMatchObject({ error: { code: 'ORGANIZATION_CONTEXT_REQUIRED' } });
  });
});
