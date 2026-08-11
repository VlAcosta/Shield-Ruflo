import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import {
  addSnapshotSchema,
  benchmarkQuerySchema,
  competitorIdParamsSchema,
  competitorListQuerySchema,
  competitorLocationParamsSchema,
  createCompetitorSchema,
  googleLiveLocationQuerySchema,
  googleLiveSearchSchema,
  snapshotListQuerySchema,
  updateCompetitorSchema,
} from './competitive.schemas.js';
import {
  addCompetitiveSnapshot,
  competitiveBenchmark,
  competitiveProviderAvailability,
  createCompetitor,
  discoverGoogleCompetitors,
  getCompetitor,
  getLiveCompetitorLocation,
  listCompetitiveSnapshots,
  listCompetitors,
  updateCompetitor,
} from './competitive.service.js';

function tenant(request: FastifyRequest) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return { organizationId: request.auth.organizationId, userId: request.auth.userId };
}

export const competitiveRoutes: FastifyPluginAsync = async (app) => {
  app.get('/competitive/providers', { preHandler: [app.authenticate, app.authorize('competitive.view')] }, async () => competitiveProviderAvailability());

  app.post('/competitive/live/google/search', { preHandler: [app.authenticate, app.authorize('competitive.manage')] }, async (request) => {
    const { query, languageCode } = googleLiveSearchSchema.parse(request.body);
    return discoverGoogleCompetitors(query, languageCode);
  });

  app.get('/competitive/competitors', { preHandler: [app.authenticate, app.authorize('competitive.view')] }, async (request) => {
    const context = tenant(request);
    const query = competitorListQuerySchema.parse(request.query);
    return listCompetitors(app, context.organizationId, {
      limit: query.limit,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
  });

  app.post('/competitive/competitors', { preHandler: [app.authenticate, app.authorize('competitive.manage')] }, async (request, reply) => {
    const context = tenant(request);
    const competitor = await createCompetitor(app, context, createCompetitorSchema.parse(request.body));
    return reply.code(201).send({ competitor });
  });

  app.get('/competitive/competitors/:competitorId', { preHandler: [app.authenticate, app.authorize('competitive.view')] }, async (request) => {
    const context = tenant(request);
    const { competitorId } = competitorIdParamsSchema.parse(request.params);
    return { competitor: await getCompetitor(app, context.organizationId, competitorId) };
  });

  app.patch('/competitive/competitors/:competitorId', { preHandler: [app.authenticate, app.authorize('competitive.manage')] }, async (request) => {
    const context = tenant(request);
    const { competitorId } = competitorIdParamsSchema.parse(request.params);
    const input = updateCompetitorSchema.parse(request.body);
    const updates = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
    };
    return { competitor: await updateCompetitor(app, context, competitorId, updates) };
  });

  app.post('/competitive/competitors/:competitorId/locations/:locationId/snapshots', { preHandler: [app.authenticate, app.authorize('competitive.manage')] }, async (request, reply) => {
    const context = tenant(request);
    const { competitorId, locationId } = competitorLocationParamsSchema.parse(request.params);
    const result = await addCompetitiveSnapshot(app, context, competitorId, locationId, addSnapshotSchema.parse(request.body));
    return reply.code(result.deduplicated ? 200 : 201).send(result);
  });

  app.get('/competitive/competitors/:competitorId/locations/:locationId/snapshots', { preHandler: [app.authenticate, app.authorize('competitive.view')] }, async (request) => {
    const context = tenant(request);
    const { competitorId, locationId } = competitorLocationParamsSchema.parse(request.params);
    const query = snapshotListQuerySchema.parse(request.query);
    return listCompetitiveSnapshots(app, context.organizationId, competitorId, locationId, {
      limit: query.limit,
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
    });
  });

  app.get('/competitive/competitors/:competitorId/locations/:locationId/live', { preHandler: [app.authenticate, app.authorize('competitive.view')] }, async (request) => {
    const context = tenant(request);
    const { competitorId, locationId } = competitorLocationParamsSchema.parse(request.params);
    const { languageCode } = googleLiveLocationQuerySchema.parse(request.query);
    return getLiveCompetitorLocation(app, context.organizationId, competitorId, locationId, languageCode);
  });

  app.get('/competitive/benchmark', { preHandler: [app.authenticate, app.authorize('competitive.view')] }, async (request) => {
    const context = tenant(request);
    const query = benchmarkQuerySchema.parse(request.query);
    return competitiveBenchmark(app, context.organizationId, {
      ...(query.businessId !== undefined ? { businessId: query.businessId } : {}),
      ...(query.locationId !== undefined ? { locationId: query.locationId } : {}),
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
    });
  });
};