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
};
