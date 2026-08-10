import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';
import { providerRegistry } from '../src/modules/integrations/providers/provider.registry.js';
import type { ProviderAdapter, ProviderConnectionContext } from '../src/modules/integrations/providers/provider.types.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P15 provider SDK integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('P15 provider adapter SDK integration', () => {
  let app: FastifyInstance;
  const organizationId = randomUUID();
  const userId = randomUUID();
  const sessionToken = `provider-sdk-${randomUUID()}`;
  const cookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(sessionToken)}`;
  const providerId = `p15-verified-${randomUUID()}`.toLowerCase();
  const providerSecret = `oauth-secret-${randomUUID()}`;
  let receivedContext: ProviderConnectionContext | null = null;
  const connect = vi.fn(async (context: ProviderConnectionContext) => {
    receivedContext = context;
    return {
      verified: true as const,
      health: 'CONNECTED' as const,
      externalAccountId: 'provider-account-123',
      validatedAt: new Date('2026-08-10T20:00:00.000Z'),
      configuration: { verifiedTenant: 'provider-tenant-a' },
    };
  });
  const disconnect = vi.fn(async () => ({ confirmed: true }));

  const adapter: ProviderAdapter = {
    id: providerId,
    displayName: 'P15 Verified Test Provider',
    capabilities: ['oauth', 'accounts.read', 'locations.read', 'reviews.read'],
    availability: () => ({ configured: true, connectable: true }),
    connect,
    disconnect,
    syncReviews: vi.fn(async () => ({ reviews: [], hasMore: false })),
  };

  beforeAll(async () => {
    providerRegistry.register(adapter);
    app = await buildApp();
    await app.prisma.organization.create({
      data: { id: organizationId, name: 'Provider SDK Org', slug: `provider-sdk-${randomUUID()}` },
    });
    await app.prisma.user.create({
      data: { id: userId, phone: `+7${Date.now()}31`, displayName: 'P15 Owner', profileCompletedAt: new Date() },
    });
    await app.prisma.organizationMember.create({
      data: { organizationId, userId, role: 'OWNER', status: 'ACTIVE' },
    });
    await app.prisma.session.create({
      data: {
        userId,
        activeOrganizationId: organizationId,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 10 * 60_000),
      },
    });
  });

  afterAll(async () => {
    providerRegistry.unregister(providerId);
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: organizationId } });
    await app.prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it('marks connected only after provider verification and keeps credentials server-side', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/integrations',
      headers: { cookie },
      payload: { provider: providerId, name: 'Verified provider account' },
    });
    expect(create.statusCode).toBe(201);
    const integrationId = create.json().integration.id as string;

    const credentials = await app.inject({
      method: 'PUT',
      url: `/api/v1/integrations/${integrationId}/credentials`,
      headers: { cookie },
      payload: { credentials: { oauthToken: providerSecret } },
    });
    expect(credentials.statusCode).toBe(200);
    expect(JSON.stringify(credentials.json())).not.toContain(providerSecret);

    const connectResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/${integrationId}/connect`,
      headers: { cookie },
    });
    expect(connectResponse.statusCode).toBe(200);
    expect(connectResponse.json().integration).toMatchObject({
      id: integrationId,
      provider: providerId,
      status: 'CONNECTED',
      externalAccountId: 'provider-account-123',
      configuration: { verifiedTenant: 'provider-tenant-a' },
    });
    expect(JSON.stringify(connectResponse.json())).not.toContain(providerSecret);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(receivedContext).not.toBeNull();
    expect(receivedContext?.organizationId).toBe(organizationId);
    expect(receivedContext?.credentials).toEqual({ oauthToken: providerSecret });

    const storedCredential = await app.prisma.integrationCredential.findUniqueOrThrow({
      where: { accountId_key: { accountId: integrationId, key: 'oauthToken' } },
    });
    expect(storedCredential.encryptedValue).not.toContain(providerSecret);

    const storedAccount = await app.prisma.integrationAccount.findUniqueOrThrow({ where: { id: integrationId } });
    expect(storedAccount.status).toBe('CONNECTED');
    expect(storedAccount.lastValidatedAt?.toISOString()).toBe('2026-08-10T20:00:00.000Z');

    const verifiedEvent = await app.prisma.integrationEvent.findFirstOrThrow({
      where: { organizationId, accountId: integrationId, type: 'connection.verified' },
      orderBy: { createdAt: 'desc' },
    });
    expect(JSON.stringify(verifiedEvent.payload)).not.toContain(providerSecret);

    const diagnostics = await app.inject({
      method: 'GET',
      url: `/api/v1/integrations/providers/${providerId}/diagnostics`,
      headers: { cookie },
    });
    expect(diagnostics.statusCode).toBe(200);
    expect(diagnostics.json()).toMatchObject({
      providerId,
      status: 'CONNECTED',
      connected: true,
      adapterInstalled: true,
      credentialsExposed: false,
      availability: { configured: true, connectable: true },
    });
    expect(diagnostics.json().capabilities).toContain('reviews.read');
    expect(JSON.stringify(diagnostics.json())).not.toContain(providerSecret);

    const catalog = await app.inject({
      method: 'GET',
      url: '/api/v1/integrations/provider-catalog',
      headers: { cookie },
    });
    expect(catalog.statusCode).toBe(200);
    expect(catalog.json().providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: providerId,
        displayName: 'P15 Verified Test Provider',
        availability: { configured: true, connectable: true },
      }),
    ]));

    const disconnectResponse = await app.inject({
      method: 'POST',
      url: `/api/v1/integrations/${integrationId}/disconnect`,
      headers: { cookie },
    });
    expect(disconnectResponse.statusCode).toBe(200);
    expect(disconnectResponse.json().integration.status).toBe('DISCONNECTED');
    expect(disconnect).toHaveBeenCalledTimes(1);

    await expect(app.prisma.integrationEvent.findFirst({
      where: { organizationId, accountId: integrationId, type: 'connection.disconnected.verified' },
    })).resolves.toBeTruthy();
  });
});
