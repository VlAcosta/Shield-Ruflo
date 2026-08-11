import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { askShieldHistoryQuerySchema, askShieldQueryIdParamsSchema, askShieldQuestionSchema } from './ask-shield.schemas.js';
import { enqueueAskShieldQuestion, getAskShieldQuery, listAskShieldHistory } from './ask-shield.service.js';

function tenant(request: FastifyRequest) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return { organizationId: request.auth.organizationId, userId: request.auth.userId };
}

export const askShieldRoutes: FastifyPluginAsync = async (app) => {
  app.post('/ask-shield/queries', { preHandler: [app.authenticate, app.authorize('analytics.view')] }, async (request, reply) => {
    const actor = tenant(request);
    const { question } = askShieldQuestionSchema.parse(request.body);
    const query = await enqueueAskShieldQuestion(app, actor, question);
    return reply.code(202).send({ query });
  });

  app.get('/ask-shield/queries', { preHandler: [app.authenticate, app.authorize('analytics.view')] }, async (request) => {
    const actor = tenant(request);
    const input = askShieldHistoryQuerySchema.parse(request.query);
    return listAskShieldHistory(app, actor.organizationId, {
      limit: input.limit,
      ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
    });
  });

  app.get('/ask-shield/queries/:queryId', { preHandler: [app.authenticate, app.authorize('analytics.view')] }, async (request) => {
    const actor = tenant(request);
    const { queryId } = askShieldQueryIdParamsSchema.parse(request.params);
    return { query: await getAskShieldQuery(app, actor.organizationId, queryId) };
  });
};
