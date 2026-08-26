import type { FastifyInstance, FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import {
  createIntegrationAccount,
  disconnectIntegration,
  listIntegrationAccounts,
  listProviderCatalog,
  queueIntegrationSync,
  requestIntegrationConnect,
  saveIntegrationCredentials,
  updateIntegrationSetup,
  updateIntegrationSyncPolicy,
} from './integrations.service.js';
import { providerDiagnostics } from './providers/provider-runtime.js';

const idParams = z.object({ integrationId: z.string().uuid() });
const providerParams = z.object({ providerId: z.string().trim().min(2).max(80) });
const createSchema = z.object({
  provider: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(180),
  externalAccountId: z.string().trim().max(240).optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
});
const credentialsSchema = z.object({ credentials: z.record(z.string().min(1).max(120), z.string().min(1).max(20_000)) });
const syncPolicySchema = z.object({
  enabled: z.boolean(),
  intervalMinutes: z.coerce.number().int().min(5).max(1440),
}).strict();
const providerConnectSchema = z.object({
  link: z.string().trim().max(2_000).optional(),
  externalAccountId: z.string().trim().max(240).optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  credentials: z.record(z.string().min(1).max(120), z.string().min(1).max(20_000)).optional(),
  syncPolicy: syncPolicySchema.optional(),
}).passthrough();

function orgId(request: FastifyRequest): string {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return request.auth.organizationId;
}

async function findProviderAccount(app: FastifyInstance, organizationId: string, providerId: string) {
  return app.prisma.integrationAccount.findFirst({
    where: { organizationId, provider: providerId.toLowerCase() },
    orderBy: { createdAt: 'desc' },
  });
}

function providerConfiguration(providerId: string, body: z.infer<typeof providerConnectSchema>): Record<string, unknown> {
  const configuration: Record<string, unknown> = { ...(body.configuration ?? {}) };
  const link = String(body.link || '').trim();
  if (link) configuration.sourceLink = link;

  if (providerId === '2gis' && !configuration.placeId && link) {
    const match = link.match(/(?:firm\/)?(\d{6,})/);
    configuration.placeId = match?.[1] || link;
  }
  if (providerId === 'wb' && !configuration.nmId && link) {
    const match = link.match(/catalog\/(\d+)/) || link.match(/^(\d+)$/);
    if (match?.[1]) configuration.nmId = match[1];
  }
  if ((providerId === 'yandex' || providerId === 'otzovik') && !configuration.externalId && link) {
    configuration.externalId = link;
  }
  return configuration;
}

function publicSyncRun(run: {
  id: string;
  status: string;
  trigger: string;
  importedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
} | null) {
  if (!run) return null;
  return {
    id: run.id,
    status: run.status,
    trigger: run.trigger,
    importedCount: run.importedCount,
    updatedCount: run.updatedCount,
    skippedCount: run.skippedCount,
    errorCount: run.errorCount,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    createdAt: run.createdAt,
  };
}

export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/integrations', { preHandler: [app.authenticate, app.authorize('integrations.view')] }, async (request) => ({
    integrations: await listIntegrationAccounts(app, orgId(request)),
  }));

  app.get('/integrations/provider-catalog', { preHandler: [app.authenticate, app.authorize('integrations.view')] }, async () => ({
    providers: listProviderCatalog(),
  }));

  app.post('/integrations', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const integration = await createIntegrationAccount(app, orgId(request), body);
    return reply.code(201).send({ integration });
  });

  app.put('/integrations/:integrationId/credentials', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, async (request) => {
    const { integrationId } = idParams.parse(request.params);
    const { credentials } = credentialsSchema.parse(request.body);
    return saveIntegrationCredentials(app, orgId(request), integrationId, credentials);
  });

  app.put('/integrations/:integrationId/sync-policy', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, async (request) => {
    const { integrationId } = idParams.parse(request.params);
    const policy = syncPolicySchema.parse(request.body);
    return { integration: await updateIntegrationSyncPolicy(app, orgId(request), integrationId, policy) };
  });

  app.post('/integrations/:integrationId/connect', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, async (request) => {
    const { integrationId } = idParams.parse(request.params);
    return requestIntegrationConnect(app, orgId(request), integrationId);
  });

  app.post('/integrations/:integrationId/disconnect', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, async (request) => {
    const { integrationId } = idParams.parse(request.params);
    return { integration: await disconnectIntegration(app, orgId(request), integrationId) };
  });

  app.post('/integrations/:integrationId/sync', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, async (request, reply) => {
    const { integrationId } = idParams.parse(request.params);
    const run = await queueIntegrationSync(app, orgId(request), integrationId, 'manual');
    return reply.code(202).send({ run: publicSyncRun(run) });
  });

  app.get('/integrations/providers/:providerId/diagnostics', { preHandler: [app.authenticate, app.authorize('integrations.view')] }, async (request) => {
    const { providerId } = providerParams.parse(request.params);
    const account = await findProviderAccount(app, orgId(request), providerId);
    const sdk = providerDiagnostics(providerId);
    const configuration = account?.configuration && typeof account.configuration === 'object' && !Array.isArray(account.configuration)
      ? account.configuration as Record<string, unknown>
      : {};
    return {
      providerId,
      status: account?.status ?? 'DISCONNECTED',
      connected: account?.status === 'CONNECTED' || account?.status === 'DEGRADED',
      lastValidatedAt: account?.lastValidatedAt ?? null,
      lastSyncedAt: account?.lastSyncedAt ?? null,
      lastErrorCode: account?.lastErrorCode ?? null,
      lastErrorMessage: account?.lastErrorMessage ?? null,
      credentialsExposed: false,
      adapterInstalled: sdk.installed,
      capabilities: sdk.capabilities,
      availability: sdk.availability,
      syncPolicy: {
        enabled: configuration.syncEnabled !== false,
        intervalMinutes: Number(configuration.syncIntervalMinutes || 30),
      },
    };
  });

  app.get('/integrations/providers/:providerId/sync-status', { preHandler: [app.authenticate, app.authorize('integrations.view')] }, async (request) => {
    const organizationId = orgId(request);
    const { providerId } = providerParams.parse(request.params);
    const account = await findProviderAccount(app, organizationId, providerId);
    if (!account) {
      return { providerId, accountId: null, lastSyncedAt: null, run: null };
    }
    const run = await app.prisma.integrationSyncRun.findFirst({
      where: { organizationId, accountId: account.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      providerId,
      accountId: account.id,
      lastSyncedAt: account.lastSyncedAt,
      run: publicSyncRun(run),
    };
  });

  const connectProvider = async (request: FastifyRequest) => {
    const organizationId = orgId(request);
    const { providerId } = providerParams.parse(request.params);
    const body = providerConnectSchema.parse(request.body ?? {});
    let account = await findProviderAccount(app, organizationId, providerId);
    const configuration = providerConfiguration(providerId.toLowerCase(), body);

    if (!account) {
      const created = await createIntegrationAccount(app, organizationId, {
        provider: providerId,
        name: providerId,
        ...(body.externalAccountId ? { externalAccountId: body.externalAccountId } : {}),
        configuration,
      });
      account = await app.prisma.integrationAccount.findFirst({ where: { id: created.id, organizationId } });
    }
    if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });

    await updateIntegrationSetup(app, organizationId, account.id, {
      configuration,
      ...(body.credentials ? { credentials: body.credentials } : {}),
      ...(body.externalAccountId !== undefined ? { externalAccountId: body.externalAccountId } : {}),
    });
    if (body.syncPolicy) {
      await updateIntegrationSyncPolicy(app, organizationId, account.id, body.syncPolicy);
    }
    return requestIntegrationConnect(app, organizationId, account.id);
  };

  app.post('/integrations/providers/:providerId/connect', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, connectProvider);
  app.post('/integrations/providers/:providerId/reconnect', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, connectProvider);

  app.post('/integrations/providers/:providerId/disconnect', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, async (request) => {
    const organizationId = orgId(request);
    const { providerId } = providerParams.parse(request.params);
    const account = await findProviderAccount(app, organizationId, providerId);
    if (!account) return { integration: { provider: providerId, status: 'DISCONNECTED', enabled: false } };
    return { integration: await disconnectIntegration(app, organizationId, account.id) };
  });

  app.post('/integrations/providers/:providerId/sync', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, async (request, reply) => {
    const organizationId = orgId(request);
    const { providerId } = providerParams.parse(request.params);
    const account = await findProviderAccount(app, organizationId, providerId);
    if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });
    const run = await queueIntegrationSync(app, organizationId, account.id, 'manual');
    return reply.code(202).send({ providerId, status: 'syncing', run: publicSyncRun(run) });
  });
};
