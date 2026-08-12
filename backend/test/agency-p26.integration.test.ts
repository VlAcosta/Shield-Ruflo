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
  throw new Error('P26 agency integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function uniquePhone(suffix: number): string {
  return `+78${String(Date.now()).slice(-8)}${suffix}`;
}

describeWithPostgres('P26 agency consent and delegated workspaces', () => {
  let app: FastifyInstance;
  const userIds: string[] = [];
  const organizationIds: string[] = [];

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

  it('requires client consent, uses delegated scopes, prefers no fake membership, and revokes immediately', async () => {
    const agencyUser = await app.prisma.user.create({
      data: { phone: uniquePhone(1), displayName: 'P26 Agency User' },
    });
    const clientOwner = await app.prisma.user.create({
      data: { phone: uniquePhone(2), displayName: 'P26 Client Owner' },
    });
    userIds.push(agencyUser.id, clientOwner.id);

    const agencyOrganization = await app.prisma.organization.create({
      data: {
        name: 'P26 Agency',
        slug: `p26-agency-${randomUUID()}`,
        plan: 'BUSINESS',
        members: { create: { userId: agencyUser.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } },
      },
    });
    const clientOrganization = await app.prisma.organization.create({
      data: {
        name: 'P26 Client',
        slug: `p26-client-${randomUUID()}`,
        members: { create: { userId: clientOwner.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } },
      },
    });
    organizationIds.push(agencyOrganization.id, clientOrganization.id);

    const agencyToken = createOpaqueToken();
    const clientToken = createOpaqueToken();
    await app.prisma.session.createMany({
      data: [
        {
          userId: agencyUser.id,
          activeOrganizationId: agencyOrganization.id,
          tokenHash: hashSessionToken(agencyToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
        {
          userId: clientOwner.id,
          activeOrganizationId: clientOrganization.id,
          tokenHash: hashSessionToken(clientToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      ],
    });

    const beforeConsent = await app.inject({
      method: 'GET',
      url: '/api/v1/agency/workspaces',
      headers: bearer(agencyToken),
    });
    expect(beforeConsent.statusCode).toBe(200);
    expect(beforeConsent.json()).toEqual({ workspaces: [] });

    const rejectedEscalation = await app.inject({
      method: 'POST',
      url: '/api/v1/agency/invitations',
      headers: bearer(agencyToken),
      payload: {
        clientOrganizationId: clientOrganization.id,
        permissions: ['reviews.view', 'billing.manage'],
      },
    });
    expect(rejectedEscalation.statusCode).toBe(400);
    expect(rejectedEscalation.json()).toMatchObject({ error: { code: 'AGENCY_PERMISSION_NOT_DELEGABLE' } });

    const invitationResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/agency/invitations',
      headers: bearer(agencyToken),
      payload: {
        clientOrganizationId: clientOrganization.id,
        permissions: ['dashboard.view', 'reviews.view', 'reviews.reply'],
      },
    });
    expect(invitationResponse.statusCode).toBe(201);
    const invitationPayload = invitationResponse.json();
    expect(invitationPayload.token).toEqual(expect.any(String));
    expect(invitationPayload.token.length).toBeGreaterThanOrEqual(40);

    const storedInvitation = await app.prisma.$queryRaw<Array<{ tokenHash: string }>>`
      SELECT "token_hash" AS "tokenHash"
      FROM "agency_invitations"
      WHERE "id" = CAST(${invitationPayload.invitation.id} AS uuid)
    `;
    expect(storedInvitation[0]?.tokenHash).toBe(hashSessionToken(invitationPayload.token));
    expect(storedInvitation[0]?.tokenHash).not.toBe(invitationPayload.token);

    const acceptResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/agency/invitations/${encodeURIComponent(invitationPayload.token)}/accept`,
      headers: bearer(clientToken),
    });
    expect(acceptResponse.statusCode).toBe(200);
    const accepted = acceptResponse.json();
    expect(accepted.grant.permissions).toEqual(['dashboard.view', 'reviews.view', 'reviews.reply']);

    const replayResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/agency/invitations/${encodeURIComponent(invitationPayload.token)}/accept`,
      headers: bearer(clientToken),
    });
    expect(replayResponse.statusCode).toBe(409);
    expect(replayResponse.json()).toMatchObject({ error: { code: 'AGENCY_INVITATION_NOT_PENDING' } });

    const workspacesResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/agency/workspaces',
      headers: bearer(agencyToken),
    });
    expect(workspacesResponse.statusCode).toBe(200);
    expect(workspacesResponse.json().workspaces).toHaveLength(1);
    expect(workspacesResponse.json().workspaces[0]).toMatchObject({
      organization: { id: clientOrganization.id },
      agency: { id: agencyOrganization.id },
      access: {
        mode: 'DELEGATED',
        permissions: ['dashboard.view', 'reviews.view', 'reviews.reply'],
      },
    });

    const selectResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/agency/workspaces/${clientOrganization.id}/select`,
      headers: bearer(agencyToken),
    });
    expect(selectResponse.statusCode).toBe(200);
    expect(selectResponse.json()).toMatchObject({
      workspace: { organizationId: clientOrganization.id, accessMode: 'DELEGATED' },
    });

    const delegatedMe = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: bearer(agencyToken),
    });
    expect(delegatedMe.statusCode).toBe(200);
    expect(delegatedMe.json()).toMatchObject({
      user: { membership: null },
      organizationContext: {
        organizationId: clientOrganization.id,
        membershipId: null,
        role: null,
        permissions: ['dashboard.view', 'reviews.view', 'reviews.reply'],
        accessMode: 'DELEGATED',
        agencyOrganizationId: agencyOrganization.id,
        delegatedGrantId: accepted.grant.id,
        agencyClientLinkId: accepted.link.id,
      },
    });

    const reviewsAllowed = await app.inject({
      method: 'GET',
      url: '/api/v1/reviews',
      headers: bearer(agencyToken),
    });
    expect(reviewsAllowed.statusCode).toBe(200);

    const billingDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/billing/subscription',
      headers: bearer(agencyToken),
    });
    expect(billingDenied.statusCode).toBe(403);
    expect(billingDenied.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });

    const revokeResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/agency/client-access/${accepted.link.id}/revoke`,
      headers: bearer(clientToken),
    });
    expect(revokeResponse.statusCode).toBe(200);
    expect(revokeResponse.json()).toEqual({ ok: true, linkId: accepted.link.id });

    const afterRevoke = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: bearer(agencyToken),
    });
    expect(afterRevoke.statusCode).toBe(200);
    expect(afterRevoke.json().organizationContext).toBeNull();

    const workspacesAfterRevoke = await app.inject({
      method: 'GET',
      url: '/api/v1/agency/workspaces',
      headers: bearer(agencyToken),
    });
    expect(workspacesAfterRevoke.statusCode).toBe(200);
    expect(workspacesAfterRevoke.json()).toEqual({ workspaces: [] });
  });
});
