import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p4|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P4 integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('P4 profile and team production flows', () => {
  let app: FastifyInstance;

  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const ownerAId = randomUUID();
  const invitedUserId = randomUUID();
  const ownerAMembershipId = randomUUID();
  const organizationBMembershipId = randomUUID();

  const ownerAToken = `p4-owner-${randomUUID()}`;
  const invitedToken = `p4-invited-${randomUUID()}`;
  const ownerACookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(ownerAToken)}`;
  const invitedCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(invitedToken)}`;

  beforeAll(async () => {
    app = await buildApp();

    await app.prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'P4 Organization A', slug: `p4-a-${randomUUID()}` },
        { id: organizationBId, name: 'P4 Organization B', slug: `p4-b-${randomUUID()}` },
      ],
    });

    await app.prisma.user.createMany({
      data: [
        {
          id: ownerAId,
          phone: `+7${Date.now()}41`,
          email: `p4-owner-${randomUUID()}@example.test`,
          firstName: 'Owner',
          lastName: 'A',
          profileCompletedAt: new Date(),
        },
        {
          id: invitedUserId,
          phone: `+7${Date.now()}42`,
          email: `p4-invitee-${randomUUID()}@example.test`,
          firstName: 'Invitee',
          lastName: 'B',
          profileCompletedAt: new Date(),
        },
      ],
    });

    await app.prisma.organizationMember.createMany({
      data: [
        {
          id: ownerAMembershipId,
          organizationId: organizationAId,
          userId: ownerAId,
          role: 'OWNER',
          status: 'ACTIVE',
        },
        {
          id: organizationBMembershipId,
          organizationId: organizationBId,
          userId: invitedUserId,
          role: 'OWNER',
          status: 'ACTIVE',
        },
      ],
    });

    await app.prisma.session.createMany({
      data: [
        {
          userId: ownerAId,
          activeOrganizationId: organizationAId,
          tokenHash: hashSessionToken(ownerAToken),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
        {
          userId: invitedUserId,
          activeOrganizationId: organizationBId,
          tokenHash: hashSessionToken(invitedToken),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [ownerAId, invitedUserId] } } });
    await app.close();
  });

  it('persists personal profile fields and notification preferences on the server', async () => {
    const updated = await app.inject({
      method: 'PATCH',
      url: '/api/v1/profile/personal',
      headers: { cookie: ownerACookie },
      payload: {
        firstName: 'Updated',
        position: 'Owner / CEO',
        telegram: '@businessshield',
        notifications: { email: false, telegram: true, push: true },
      },
    });

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      snapshot: {
        personal: {
          firstName: 'Updated',
          position: 'Owner / CEO',
          telegram: '@businessshield',
          notifications: { email: false, telegram: true, push: true },
        },
      },
    });

    const restored = await app.inject({ method: 'GET', url: '/api/v1/profile', headers: { cookie: ownerACookie } });
    expect(restored.statusCode).toBe(200);
    expect(restored.json()).toMatchObject({
      snapshot: { personal: { notifications: { email: false, telegram: true, push: true } } },
    });
  });

  it('supports a hashed one-time invitation accepted by a second account', async () => {
    const invitedUser = await app.prisma.user.findUniqueOrThrow({ where: { id: invitedUserId } });

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/team/invitations',
      headers: { cookie: ownerACookie },
      payload: {
        name: 'Second account',
        email: invitedUser.email,
        role: 'MEMBER',
        permissionOverrides: { allow: [], deny: [] },
      },
    });

    expect(created.statusCode).toBe(200);
    const invitation = created.json().invitation as { id: string; token: string };
    expect(invitation.token).toBeTruthy();

    const persistedInvitation = await app.prisma.teamInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(persistedInvitation.tokenHash).not.toBe(invitation.token);
    expect(persistedInvitation.status).toBe('PENDING');

    const accepted = await app.inject({
      method: 'POST',
      url: `/api/v1/team/invitations/${encodeURIComponent(invitation.token)}/accept`,
      headers: { cookie: invitedCookie },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({ membership: { organizationId: organizationAId, backendRole: 'MEMBER' } });

    const acceptedAgain = await app.inject({
      method: 'POST',
      url: `/api/v1/team/invitations/${encodeURIComponent(invitation.token)}/accept`,
      headers: { cookie: invitedCookie },
    });
    expect(acceptedAgain.statusCode).toBe(200);

    const refreshedInvitation = await app.prisma.teamInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(refreshedInvitation.status).toBe('ACCEPTED');
    expect(refreshedInvitation.acceptedByUserId).toBe(invitedUserId);

    const invitedSession = await app.prisma.session.findFirstOrThrow({ where: { tokenHash: hashSessionToken(invitedToken) } });
    expect(invitedSession.activeOrganizationId).toBe(organizationAId);
  });

  it('protects the last usable OWNER from self-demotion', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/team/members/${ownerAMembershipId}`,
      headers: { cookie: ownerACookie },
      payload: { role: 'ADMIN' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: 'LAST_OWNER_REQUIRED' } });

    const owner = await app.prisma.organizationMember.findUniqueOrThrow({ where: { id: ownerAMembershipId } });
    expect(owner.role).toBe('OWNER');
  });

  it('returns a tenant-safe 404 for a foreign organization member ID', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/v1/team/members/${organizationBMembershipId}`,
      headers: { cookie: ownerACookie },
      payload: { role: 'MEMBER' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: 'MEMBER_NOT_FOUND' } });
  });

  it('revokes only sessions scoped to the managed organization', async () => {
    const membershipA = await app.prisma.organizationMember.findUniqueOrThrow({
      where: { organizationId_userId: { organizationId: organizationAId, userId: invitedUserId } },
    });
    const sessionA2Token = `p4-org-a-extra-${randomUUID()}`;
    const sessionB2Token = `p4-org-b-extra-${randomUUID()}`;

    await app.prisma.session.createMany({
      data: [
        {
          userId: invitedUserId,
          activeOrganizationId: organizationAId,
          tokenHash: hashSessionToken(sessionA2Token),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
        {
          userId: invitedUserId,
          activeOrganizationId: organizationBId,
          tokenHash: hashSessionToken(sessionB2Token),
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      ],
    });

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/v1/team/members/${membershipA.id}/sessions`,
      headers: { cookie: ownerACookie },
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().revoked).toBeGreaterThanOrEqual(2);

    const sessionsA = await app.prisma.session.findMany({
      where: { userId: invitedUserId, activeOrganizationId: organizationAId },
    });
    expect(sessionsA.length).toBeGreaterThanOrEqual(2);
    expect(sessionsA.every((session) => session.revokedAt !== null)).toBe(true);

    const sessionB = await app.prisma.session.findFirstOrThrow({ where: { tokenHash: hashSessionToken(sessionB2Token) } });
    expect(sessionB.activeOrganizationId).toBe(organizationBId);
    expect(sessionB.revokedAt).toBeNull();
  });

  it('writes audit events for invitation acceptance and team security actions', async () => {
    const actions = await app.prisma.auditLog.findMany({
      where: { organizationId: organizationAId },
      select: { action: true },
    });
    const actionNames = actions.map((entry) => entry.action);
    expect(actionNames).toContain('team.invitation.created');
    expect(actionNames).toContain('team.invitation.accepted');
    expect(actionNames).toContain('team.sessions.revoked');
    expect(actionNames).toContain('profile.personal.updated');
  });
});
