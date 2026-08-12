import type { FastifyPluginAsync } from 'fastify';
import {
  createServiceAccountKeySchema,
  createServiceAccountSchema,
  serviceAccountIdParamsSchema,
  serviceAccountKeyParamsSchema,
} from './api-identity.schemas.js';
import {
  createServiceAccount,
  createServiceAccountKey,
  listServiceAccounts,
  revokeServiceAccount,
  revokeServiceAccountKey,
} from './api-identity.service.js';

export const apiIdentityRoutes: FastifyPluginAsync = async (app) => {
  app.get('/service-accounts', {
    preHandler: [app.authenticate, app.authorize('api_keys.view')],
  }, async (request) => listServiceAccounts(app, request));

  app.post('/service-accounts', {
    preHandler: [app.authenticate, app.authorize('api_keys.manage')],
  }, async (request, reply) => {
    const input = createServiceAccountSchema.parse(request.body);
    const result = await createServiceAccount(app, request, {
      name: input.name,
      permissions: input.permissions,
      initialKeyName: input.initialKeyName,
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
      ...(input.initialKeyExpiresAt === undefined ? {} : { initialKeyExpiresAt: input.initialKeyExpiresAt }),
    });
    return reply.code(201).send(result);
  });

  app.post('/service-accounts/:serviceAccountId/keys', {
    preHandler: [app.authenticate, app.authorize('api_keys.manage')],
  }, async (request, reply) => {
    const { serviceAccountId } = serviceAccountIdParamsSchema.parse(request.params);
    const input = createServiceAccountKeySchema.parse(request.body);
    const result = await createServiceAccountKey(app, request, serviceAccountId, {
      name: input.name,
      ...(input.permissions === undefined ? {} : { permissions: input.permissions }),
      ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    });
    return reply.code(201).send(result);
  });

  app.delete('/service-accounts/:serviceAccountId/keys/:apiKeyId', {
    preHandler: [app.authenticate, app.authorize('api_keys.manage')],
  }, async (request) => {
    const { serviceAccountId, apiKeyId } = serviceAccountKeyParamsSchema.parse(request.params);
    return revokeServiceAccountKey(app, request, serviceAccountId, apiKeyId);
  });

  app.post('/service-accounts/:serviceAccountId/revoke', {
    preHandler: [app.authenticate, app.authorize('api_keys.manage')],
  }, async (request) => {
    const { serviceAccountId } = serviceAccountIdParamsSchema.parse(request.params);
    return revokeServiceAccount(app, request, serviceAccountId);
  });
};
