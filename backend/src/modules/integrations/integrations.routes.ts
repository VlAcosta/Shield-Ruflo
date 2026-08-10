import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import {
  createIntegrationAccount,
  disconnectIntegration,
  listIntegrationAccounts,
  queueIntegrationSync,
  requestIntegrationConnect,
  saveIntegrationCredentials,
} from './integrations.service.js';

const idParams = z.object({ integrationId: z.string().uuid() });
const providerParams = z.object({ providerId: z.string().trim().min(2).max(80) });
const createSchema = z.object({
  provider: z.string().trim().min(2).max(80),
  name: z.string().trim().min(1).max(180),
  externalAccountId: z.string().trim().max(240).optional(),
  configuration: z.record(z.string(), z.unknown()).optional(),
});
const credentialsSchema = z.object({ credentials: z.record(z.string().min(1).max(120), z.string().min(1).max(20_000)) });

function orgId(request: { auth?: { organizationId?: string | null } }): string {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return request.auth.organizationId;
}

async function findProviderAccount(app: Parameters<FastifyPluginAsync>[0], organizationId: string, providerId: string) {
  return app.prisma.integrationAccount.findFirst({
    where: { organizationId, provider: providerId.toLowerCase() },
    orderBy: { createdAt: 'desc' },
  });
}

export const integrationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/integrations', { preHandler: [app.authenticate, app.authorize('integrations.view')] }, async (request) => ({
    integrations: await listIntegrationAccounts(app, orgId(request)),
  }));

  app.post('/integrations', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, async (request, reply) => {
    const integration = await createIntegrationAccount(app, orgId(request), createSchema.parse(request.body));
    return reply.code(201).send({ integration });
  });

  app.put('/integrations/:integrationId/credentials', { preHandler: [app.authenticate, app.authorize('integrations.manage')] }, async (request) => {
    const { integrationId } = idParams.parse(request.params);
    const { credentials } = credentialsSchema.parse(request.body);
    return saveIntegrationCredentials(app, orgId(request), integrationId, credentials);
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
    const run = await queueIntegrationSync(app, orgId(request), integrationId);
    return reply.code(202).send({ run });
  });

  // Compatibility contract for the existing frontend provider registry.
  // It maps provider cards to durable IntegrationAccount rows while keeping
  // provider connection truth on the backend.
  app.get('/integrations/providers/:providerId/diagnostics', { preHandler: [app.authenticate, app.authorize('integrations.view')] }, async (request) => {
    const { providerId } = providerParams.parse(request.params);
    const account = await findProviderAccount(app, orgId(request), providerId);
    return {
      providerId,
      status: account?.status ?? 'DISCONNECTED',
      connected: account?.status === 'CONNECTED',
      lastValidatedAt: account?.lastValidatedAt ?? null,
      lastSyncedAt: account?.lastSyncedAt ?? null,
      lastErrorCode: account?.lastErrorCode ?? null,
      lastErrorMessage: account?.lastErrorMessage ?? null,
      credentialsExposed: false,
    };
  });

  const connectProvider = async (request: any) => {
    const organizationId = orgId(request);
    const { providerId } = providerParams.parse(request.params);
    let account = await findProviderAccount(app, organizationId, providerId);
    if (!account) {
      const created = await createIntegrationAccount(app, organizationId, {
        provider: providerId,
        name: providerId,
        configuration: request.body && typeof request.body === 'object' ? request.body : {},
      });
      account = await app.prisma.integrationAccount.findFirst({ where: { id: created.id, organizationId } });
    }
    if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });
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
    const run = await queueIntegrationSync(app, organizationId, account.id);
    return reply.code(202).send({ providerId, status: 'syncing', run });
  });
};
