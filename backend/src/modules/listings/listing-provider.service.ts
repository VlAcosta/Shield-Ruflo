import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { loadIntegrationCredentials } from '../integrations/providers/credential-vault.js';
import { providerRegistry } from '../integrations/providers/provider.registry.js';
import type { ProviderConnectionContext } from '../integrations/providers/provider.types.js';

function providerContext(account: {
  id: string;
  organizationId: string;
  provider: string;
  externalAccountId: string | null;
  configuration: unknown;
}, credentials: Record<string, string>): ProviderConnectionContext {
  const configuration = account.configuration && typeof account.configuration === 'object' && !Array.isArray(account.configuration)
    ? account.configuration as Record<string, unknown>
    : {};
  return {
    organizationId: account.organizationId,
    accountId: account.id,
    provider: account.provider,
    externalAccountId: account.externalAccountId,
    configuration,
    credentials,
  };
}

export async function listListingProviderAccounts(app: FastifyInstance, organizationId: string) {
  const accounts = await app.prisma.integrationAccount.findMany({
    where: { organizationId, status: { in: ['CONNECTED', 'DEGRADED'] } },
    orderBy: [{ provider: 'asc' }, { name: 'asc' }],
    select: { id: true, provider: true, name: true, status: true, externalAccountId: true, lastValidatedAt: true, lastSyncedAt: true },
  });
  return {
    items: accounts.flatMap((account) => {
      const adapter = providerRegistry.get(account.provider);
      if (!adapter || !adapter.capabilities.includes('profile.read') || !adapter.syncLocationProfiles) return [];
      return [{ ...account, providerName: adapter.displayName }];
    }),
  };
}

export async function listListingProviderLocations(app: FastifyInstance, organizationId: string, accountId: string) {
  const account = await app.prisma.integrationAccount.findFirst({
    where: { id: accountId, organizationId, status: { in: ['CONNECTED', 'DEGRADED'] } },
  });
  if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });
  const adapter = providerRegistry.get(account.provider);
  if (!adapter || !adapter.capabilities.includes('profile.read') || !adapter.syncLocationProfiles) {
    throw new AppError({ code: 'LISTING_PROVIDER_PROFILE_UNSUPPORTED', message: 'Провайдер не поддерживает чтение location profile', statusCode: 409 });
  }
  const credentials = await loadIntegrationCredentials(app, organizationId, account.id);
  const records = await adapter.syncLocationProfiles(providerContext(account, credentials));
  return {
    provider: { id: adapter.id, name: adapter.displayName },
    items: records.map((record) => ({
      externalId: record.externalId,
      title: record.title ?? null,
      address: record.address ?? null,
      phone: record.phone ?? null,
      website: record.website ?? null,
      categories: record.categories ?? [],
      coveredFields: [...record.coveredFields],
      observedAt: record.observedAt?.toISOString() ?? null,
      providerUpdatedAt: record.providerUpdatedAt?.toISOString() ?? null,
    })),
  };
}
