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
  throw new Error('P26-B API identity tests require NODE_ENV=test and a test-only TEST_DATABASE_URL/DATABASE_URL');
}

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}

function uniquePhone(suffix: number) {
  return `+79${String(Date.now()).slice(-8)}${suffix}`;
}

describeWithPostgres('P26-B scoped service accounts and API keys', () => {
  let app: FastifyInstance;
  const organizationIds: string[] = [];
  const userIds: string[] = [];
  let startOrganizationId = '';
  let proOrganizationId = '';
  let otherOrganizationId = '';
  let proSubscriptionId = '';
  let startPlanId = '';
  let startToken = '';
  let proToken = '';
  let ownReviewId = '';
  let foreignReviewId = '';
  let serviceAccountId = '';
  let apiKeyId = '';
  let apiKeyToken = '';
  let apiKeyPrefix = '';

  beforeAll(async () => {
    app = await buildApp();

    app.get('/__test/p26b-billing-scope', {
      preHandler: [app.authenticateApiKey, app.authorizeApiScope('billing.manage')],
    }, async () => ({ ok: true }));

    const [startPlan, proPlan] = await Promise.all([
      app.prisma.plan.findUniqueOrThrow({ where: { code: 'START' } }),
      app.prisma.plan.findUniqueOrThrow({ where: { code: 'PRO' } }),
    ]);
    startPlanId = startPlan.id;

    const [startOrg, proOrg, otherOrg] = await Promise.all([
      app.prisma.organization.create({ data: { name: 'P26B Start', slug: `p26b-start-${randomUUID()}` } }),
      app.prisma.organization.create({ data: { name: 'P26B Pro', slug: `p26b-pro-${randomUUID()}` } }),
      app.prisma.organization.create({ data: { name: 'P26B Other', slug: `p26b-other-${randomUUID()}` } }),
    ]);
    startOrganizationId = startOrg.id;
    proOrganizationId = proOrg.id;
    otherOrganizationId = otherOrg.id;
    organizationIds.push(startOrg.id, proOrg.id, otherOrg.id);

    const subscriptions = await Promise.all([
      app.prisma.subscription.create({
        data: { organizationId: startOrg.id, planId: startPlan.id, status: 'ACTIVE', autoRenew: false },
      }),
      app.prisma.subscription.create({
        data: { organizationId: proOrg.id, planId: proPlan.id, status: 'ACTIVE', autoRenew: false },
      }),
      app.prisma.subscription.create({
        data: { organizationId: otherOrg.id, planId: proPlan.id, status: 'ACTIVE', autoRenew: false },
      }),
    ]);
    proSubscriptionId = subscriptions[1].id;

    const [startUser, proUser] = await Promise.all([
      app.prisma.user.create({ data: { phone: uniquePhone(1), displayName: 'P26B Start Owner' } }),
      app.prisma.user.create({ data: { phone: uniquePhone(2), displayName: 'P26B Pro Owner' } }),
    ]);
    userIds.push(startUser.id, proUser.id);

    await app.prisma.organizationMember.createMany({
      data: [
        { organizationId: startOrg.id, userId: startUser.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
        { organizationId: proOrg.id, userId: proUser.id, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() },
      ],
    });

    startToken = createOpaqueToken();
    proToken = createOpaqueToken();
    await app.prisma.session.createMany({
      data: [
        {
          userId: startUser.id,
          activeOrganizationId: startOrg.id,
          tokenHash: hashSessionToken(startToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
        {
          userId: proUser.id,
          activeOrganizationId: proOrg.id,
          tokenHash: hashSessionToken(proToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      ],
    });

    async function seedReview(organizationId: string, label: string) {
      const business = await app.prisma.business.create({
        data: { organizationId, name: `${label} Business`, status: 'ACTIVE', isPrimary: true },
      });
      const location = await app.prisma.location.create({
        data: { businessId: business.id, name: `${label} Location`, status: 'ACTIVE', isPrimary: true },
      });
      const source = await app.prisma.reviewSource.create({
        data: {
          organizationId,
          businessId: business.id,
          locationId: location.id,
          provider: `p26b-${label.toLowerCase()}`,
          name: `${label} Source`,
        },
      });
      return app.prisma.review.create({
        data: {
          organizationId,
          businessId: business.id,
          locationId: location.id,
          sourceId: source.id,
          externalId: `p26b-${label.toLowerCase()}-${randomUUID()}`,
          rating: label === 'Own' ? 5 : 1,
          title: `${label} review`,
          text: `${label} tenant review`,
          receivedAt: new Date(),
          publishedAt: new Date(),
        },
      });
    }

    const [ownReview, foreignReview] = await Promise.all([
      seedReview(proOrg.id, 'Own'),
      seedReview(otherOrg.id, 'Foreign'),
    ]);
    ownReviewId = ownReview.id;
    foreignReviewId = foreignReview.id;
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

  it('blocks service-account management when apiAccess is not entitled', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/service-accounts',
      headers: bearer(startToken),
      payload: {
        name: 'Blocked integration',
        permissions: ['reviews.view'],
        initialKeyName: 'Blocked key',
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: { code: 'ENTITLEMENT_REQUIRED' } });
  });

  it('rejects administrative scopes and reveals a newly issued secret only once', async () => {
    const rejected = await app.inject({
      method: 'POST',
      url: '/api/v1/service-accounts',
      headers: bearer(proToken),
      payload: {
        name: 'Escalation attempt',
        permissions: ['reviews.view', 'billing.manage'],
        initialKeyName: 'Escalated key',
      },
    });
    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toMatchObject({
      error: { code: 'API_KEY_SCOPE_NOT_ALLOWED', details: { rejected: ['billing.manage'] } },
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/service-accounts',
      headers: bearer(proToken),
      payload: {
        name: 'Reporting integration',
        description: 'Read-only reputation export',
        permissions: ['reviews.view'],
        initialKeyName: 'Primary reporting key',
      },
    });
    expect(created.statusCode).toBe(201);
    const body = created.json();
    serviceAccountId = body.serviceAccount.id;
    apiKeyId = body.apiKey.id;
    apiKeyToken = body.apiKey.token;
    apiKeyPrefix = body.apiKey.prefix;
    expect(apiKeyToken).toMatch(/^bsk_live_[a-f0-9]{16}_[A-Za-z0-9_-]{40,}$/);

    const stored = await app.prisma.serviceAccountApiKey.findUniqueOrThrow({ where: { id: apiKeyId } });
    expect(stored.prefix).toBe(apiKeyPrefix);
    expect(stored.tokenHash).toBe(hashSessionToken(apiKeyToken));
    expect(stored.tokenHash).not.toBe(apiKeyToken);

    const listed = await app.inject({
      method: 'GET',
      url: '/api/v1/service-accounts',
      headers: bearer(proToken),
    });
    expect(listed.statusCode).toBe(200);
    const listedBody = listed.json();
    expect(JSON.stringify(listedBody)).not.toContain(apiKeyToken);
    expect(JSON.stringify(listedBody)).not.toContain(stored.tokenHash);
    expect(listedBody.items[0]).toMatchObject({
      id: serviceAccountId,
      permissions: ['reviews.view'],
      keys: [expect.objectContaining({ id: apiKeyId, prefix: apiKeyPrefix })],
    });
  });

  it('keeps API-key traffic on an isolated, tenant-scoped read-only surface', async () => {
    const external = await app.inject({
      method: 'GET',
      url: '/api/v1/external/reviews?pageSize=100',
      headers: bearer(apiKeyToken),
    });
    expect(external.statusCode).toBe(200);
    const ids = external.json().items.map((item: { id: string }) => item.id);
    expect(ids).toContain(ownReviewId);
    expect(ids).not.toContain(foreignReviewId);

    const foreignDetail = await app.inject({
      method: 'GET',
      url: `/api/v1/external/reviews/${foreignReviewId}`,
      headers: bearer(apiKeyToken),
    });
    expect(foreignDetail.statusCode).toBe(404);
    expect(foreignDetail.json()).toMatchObject({ error: { code: 'REVIEW_NOT_FOUND' } });

    const dashboardDenied = await app.inject({
      method: 'GET',
      url: '/api/v1/external/dashboard/overview',
      headers: bearer(apiKeyToken),
    });
    expect(dashboardDenied.statusCode).toBe(403);
    expect(dashboardDenied.json()).toMatchObject({
      error: { code: 'API_KEY_SCOPE_REQUIRED', details: { permission: 'dashboard.view' } },
    });

    const browserRoute = await app.inject({
      method: 'GET',
      url: '/api/v1/reviews',
      headers: bearer(apiKeyToken),
    });
    expect(browserRoute.statusCode).toBe(401);
    expect(browserRoute.json()).toMatchObject({ error: { code: 'SESSION_INVALID' } });
  });

  it('intersects untrusted database scopes with the runtime allowlist and revokes immediately', async () => {
    await app.prisma.$transaction([
      app.prisma.serviceAccount.update({
        where: { id: serviceAccountId },
        data: { permissions: ['reviews.view', 'billing.manage'] },
      }),
      app.prisma.serviceAccountApiKey.update({
        where: { id: apiKeyId },
        data: { permissions: ['reviews.view', 'billing.manage'] },
      }),
    ]);

    const escalation = await app.inject({
      method: 'GET',
      url: '/__test/p26b-billing-scope',
      headers: bearer(apiKeyToken),
    });
    expect(escalation.statusCode).toBe(403);
    expect(escalation.json()).toMatchObject({
      error: { code: 'API_KEY_SCOPE_REQUIRED', details: { permission: 'billing.manage' } },
    });

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/api/v1/service-accounts/${serviceAccountId}/keys/${apiKeyId}`,
      headers: bearer(proToken),
    });
    expect(revoked.statusCode).toBe(200);
    expect(revoked.json().apiKey.revokedAt).toEqual(expect.any(String));

    const afterRevoke = await app.inject({
      method: 'GET',
      url: '/api/v1/external/reviews',
      headers: bearer(apiKeyToken),
    });
    expect(afterRevoke.statusCode).toBe(401);
    expect(afterRevoke.json()).toMatchObject({ error: { code: 'API_KEY_INVALID' } });
  });

  it('revokes all account keys and disables surviving credentials after plan downgrade', async () => {
    const secondKeyResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/service-accounts/${serviceAccountId}/keys`,
      headers: bearer(proToken),
      payload: { name: 'Replacement key', permissions: ['reviews.view'] },
    });
    expect(secondKeyResponse.statusCode).toBe(201);
    const secondToken = secondKeyResponse.json().apiKey.token as string;

    const accountRevoked = await app.inject({
      method: 'POST',
      url: `/api/v1/service-accounts/${serviceAccountId}/revoke`,
      headers: bearer(proToken),
    });
    expect(accountRevoked.statusCode).toBe(200);
    expect(accountRevoked.json().serviceAccount.status).toBe('revoked');

    const revokedAccountKey = await app.inject({
      method: 'GET',
      url: '/api/v1/external/reviews',
      headers: bearer(secondToken),
    });
    expect(revokedAccountKey.statusCode).toBe(401);

    const replacementAccount = await app.inject({
      method: 'POST',
      url: '/api/v1/service-accounts',
      headers: bearer(proToken),
      payload: {
        name: 'Downgrade sentinel',
        permissions: ['reviews.view'],
        initialKeyName: 'Downgrade key',
      },
    });
    expect(replacementAccount.statusCode).toBe(201);
    const downgradeToken = replacementAccount.json().apiKey.token as string;

    await app.prisma.subscription.update({
      where: { id: proSubscriptionId },
      data: { status: 'CANCELED', autoRenew: false },
    });
    await app.prisma.subscription.create({
      data: {
        organizationId: proOrganizationId,
        planId: startPlanId,
        status: 'ACTIVE',
        autoRenew: false,
      },
    });

    const afterDowngrade = await app.inject({
      method: 'GET',
      url: '/api/v1/external/reviews',
      headers: bearer(downgradeToken),
    });
    expect(afterDowngrade.statusCode).toBe(403);
    expect(afterDowngrade.json()).toMatchObject({ error: { code: 'ENTITLEMENT_REQUIRED' } });

    const managementAfterDowngrade = await app.inject({
      method: 'GET',
      url: '/api/v1/service-accounts',
      headers: bearer(proToken),
    });
    expect(managementAfterDowngrade.statusCode).toBe(403);
    expect(managementAfterDowngrade.json()).toMatchObject({ error: { code: 'ENTITLEMENT_REQUIRED' } });

    const auditActions = await app.prisma.auditLog.findMany({
      where: {
        organizationId: proOrganizationId,
        action: { startsWith: 'service_account.' },
      },
      select: { action: true },
    });
    expect(auditActions.map((item) => item.action)).toEqual(expect.arrayContaining([
      'service_account.created',
      'service_account.api_key.created',
      'service_account.api_key.revoked',
      'service_account.revoked',
    ]));
  });
});
