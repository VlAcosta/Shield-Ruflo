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
  throw new Error('P8/P11 integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('Integration and billing provider truth', () => {
  let app: FastifyInstance;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const userAId = randomUUID();
  const userBId = randomUUID();
  const foreignIntegrationId = randomUUID();
  const sessionToken = `provider-truth-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;

  beforeAll(async () => {
    app = await buildApp();
    await app.prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'Provider Truth A', slug: `provider-truth-a-${randomUUID()}` },
        { id: organizationBId, name: 'Provider Truth B', slug: `provider-truth-b-${randomUUID()}` },
      ],
    });
    await app.prisma.user.createMany({
      data: [
        { id: userAId, phone: `+7${Date.now()}21`, displayName: 'Provider Owner A', profileCompletedAt: new Date() },
        { id: userBId, phone: `+7${Date.now()}22`, displayName: 'Provider Owner B', profileCompletedAt: new Date() },
      ],
    });
    await app.prisma.organizationMember.createMany({
      data: [
        { organizationId: organizationAId, userId: userAId, role: 'OWNER', status: 'ACTIVE' },
        { organizationId: organizationBId, userId: userBId, role: 'OWNER', status: 'ACTIVE' },
      ],
    });
    await app.prisma.integrationAccount.create({
      data: {
        id: foreignIntegrationId,
        organizationId: organizationBId,
        provider: 'foreign-provider',
        name: 'Foreign private integration',
        status: 'DISCONNECTED',
      },
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
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await app.close();
  });

  it('stores credentials encrypted and never reports connected without a real adapter', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations',
      headers: { cookie },
      payload: { provider: 'test-provider', name: 'Test provider' },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().integration).toMatchObject({ provider: 'test-provider', status: 'DISCONNECTED' });
    const integrationId = create.json().integration.id as string;

    const secret = `plain-secret-${randomUUID()}`;
    const credentials = await app.inject({
      method: 'PUT',
      url: `/api/v1/integrations/${integrationId}/credentials`,
      headers: { cookie },
      payload: { credentials: { apiToken: secret } },
    });
    expect(credentials.statusCode).toBe(200);
    expect(credentials.json()).toEqual({ configured: true, keys: ['apiToken'] });
    expect(JSON.stringify(credentials.json())).not.toContain(secret);

    const stored = await app.prisma.integrationCredential.findUniqueOrThrow({
      where: { accountId_key: { accountId: integrationId, key: 'apiToken' } },
    });
    expect(stored.encryptedValue).not.toBe(secret);
    expect(stored.encryptedValue.startsWith('v1:')).toBe(true);

    const connect = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/${integrationId}/connect`,
      headers: { cookie },
    });
    expect(connect.statusCode).toBe(422);
    expect(connect.json()).toMatchObject({ error: { code: 'PROVIDER_ADAPTER_NOT_CONFIGURED' } });

    await expect(app.prisma.integrationAccount.findUniqueOrThrow({ where: { id: integrationId } }))
      .resolves.toMatchObject({ status: 'ERROR', lastErrorCode: 'PROVIDER_ADAPTER_NOT_CONFIGURED' });

    const sync = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/${integrationId}/sync`,
      headers: { cookie },
    });
    expect(sync.statusCode).toBe(409);
    expect(sync.json()).toMatchObject({ error: { code: 'INTEGRATION_NOT_CONNECTED' } });
  });

  it('does not expose or mutate a foreign tenant integration', async () => {
    const writeForeignSecret = await app.inject({
      method: 'PUT',
      url: `/api/v1/integrations/${foreignIntegrationId}/credentials`,
      headers: { cookie },
      payload: { credentials: { apiToken: 'must-not-write' } },
    });
    expect(writeForeignSecret.statusCode).toBe(404);
    expect(writeForeignSecret.json()).toMatchObject({ error: { code: 'INTEGRATION_NOT_FOUND' } });
    await expect(app.prisma.integrationCredential.count({ where: { accountId: foreignIntegrationId } })).resolves.toBe(0);

    const diagnostics = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/providers/foreign-provider/diagnostics',
      headers: { cookie },
    });
    expect(diagnostics.statusCode).toBe(200);
    expect(diagnostics.json()).toMatchObject({
      providerId: 'foreign-provider',
      status: 'DISCONNECTED',
      connected: false,
      credentialsExposed: false,
    });
    expect(JSON.stringify(diagnostics.json())).not.toContain('Foreign private integration');
  });

  it('never fakes successful checkout or promo validation without a payment provider', async () => {
    const checkout = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/checkout',
      headers: { cookie },
      payload: { plan: 'PRO', total: 1980 },
    });
    expect(checkout.statusCode).toBe(503);
    expect(checkout.json()).toMatchObject({
      error: {
        code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
        details: { status: 'payment_unavailable' },
      },
    });

    const promo = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/subscription/promo/validate',
      headers: { cookie },
      payload: { code: 'FAKE100' },
    });
    expect(promo.statusCode).toBe(200);
    expect(promo.json()).toEqual({
      valid: false,
      code: 'FAKE100',
      percent: 0,
      discount: 0,
      reason: 'PROMO_SYSTEM_NOT_CONFIGURED',
    });
  });
});
