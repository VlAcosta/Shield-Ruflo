import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import {
  createVisibilityProbeSchema,
  updateVisibilityProbeSchema,
  visibilityListQuerySchema,
  visibilityMetricsQuerySchema,
  visibilityProbeIdParamsSchema,
  visibilityRunIdParamsSchema,
} from './ai-visibility.schemas.js';
import {
  createVisibilityProbe,
  enqueueVisibilityRun,
  getVisibilityProbe,
  getVisibilityRun,
  listVisibilityProbes,
  updateVisibilityProbe,
  visibilityMetrics,
} from './ai-visibility.service.js';

function tenant(request: FastifyRequest) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return { organizationId: request.auth.organizationId, userId: request.auth.userId };
}

export const aiVisibilityRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ai-visibility/probes', { preHandler: [app.authenticate, app.authorize('ai_visibility.view')] }, async (request) => {
    const context = tenant(request);
    const query = visibilityListQuerySchema.parse(request.query);
    return listVisibilityProbes(app, context.organizationId, {
      limit: query.limit,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
  });

  app.post('/ai-visibility/probes', { preHandler: [app.authenticate, app.authorize('ai_visibility.manage')] }, async (request, reply) => {
    const context = tenant(request);
    const input = createVisibilityProbeSchema.parse(request.body);
    const probe = await createVisibilityProbe(app, context, {
      name: input.name,
      query: input.query,
      languageCode: input.languageCode,
      ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
    });
    return reply.code(201).send({ probe });
  });

  app.get('/ai-visibility/probes/:probeId', { preHandler: [app.authenticate, app.authorize('ai_visibility.view')] }, async (request) => {
    const context = tenant(request);
    const { probeId } = visibilityProbeIdParamsSchema.parse(request.params);
    return { probe: await getVisibilityProbe(app, context.organizationId, probeId) };
  });

  app.patch('/ai-visibility/probes/:probeId', { preHandler: [app.authenticate, app.authorize('ai_visibility.manage')] }, async (request) => {
    const context = tenant(request);
    const { probeId } = visibilityProbeIdParamsSchema.parse(request.params);
    const input = updateVisibilityProbeSchema.parse(request.body);
    const updates = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.query !== undefined ? { query: input.query } : {}),
      ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
      ...(input.languageCode !== undefined ? { languageCode: input.languageCode } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
    return { probe: await updateVisibilityProbe(app, context, probeId, updates) };
  });

  app.post('/ai-visibility/probes/:probeId/runs', { preHandler: [app.authenticate, app.authorize('ai_visibility.run')] }, async (request, reply) => {
    const context = tenant(request);
    const { probeId } = visibilityProbeIdParamsSchema.parse(request.params);
    const result = await enqueueVisibilityRun(app, context, probeId);
    return reply.code(result.deduplicated ? 200 : 202).send(result);
  });

  app.get('/ai-visibility/runs/:runId', { preHandler: [app.authenticate, app.authorize('ai_visibility.view')] }, async (request) => {
    const context = tenant(request);
    const { runId } = visibilityRunIdParamsSchema.parse(request.params);
    return { run: await getVisibilityRun(app, context.organizationId, runId) };
  });

  app.get('/ai-visibility/metrics', { preHandler: [app.authenticate, app.authorize('ai_visibility.view')] }, async (request) => {
    const context = tenant(request);
    const query = visibilityMetricsQuerySchema.parse(request.query);
    return visibilityMetrics(app, context.organizationId, {
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
      ...(query.locationId !== undefined ? { locationId: query.locationId } : {}),
    });
  });
};
