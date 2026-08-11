import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import {
  createListingSourceSchema,
  listingOverviewQuerySchema,
  listingSourceIdParamsSchema,
  locationIdParamsSchema,
  updateCanonicalListingSchema,
} from './listing-health.schemas.js';
import {
  createListingSource,
  enqueueListingSync,
  listingHealthDetail,
  listingHealthOverview,
  updateCanonicalLocation,
} from './listing-health.service.js';

function tenant(request: FastifyRequest) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return { organizationId: request.auth.organizationId, userId: request.auth.userId };
}

export const listingHealthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/listing-health/locations', {
    preHandler: [app.authenticate, app.authorize('locations.view')],
  }, async (request) => {
    const context = tenant(request);
    const query = listingOverviewQuerySchema.parse(request.query);
    return listingHealthOverview(app, context.organizationId, {
      ...(query.businessId !== undefined ? { businessId: query.businessId } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
    });
  });

  app.get('/listing-health/locations/:locationId', {
    preHandler: [app.authenticate, app.authorize('locations.view')],
  }, async (request) => {
    const context = tenant(request);
    const { locationId } = locationIdParamsSchema.parse(request.params);
    return listingHealthDetail(app, context.organizationId, locationId);
  });

  app.patch('/listing-health/locations/:locationId/canonical', {
    preHandler: [app.authenticate, app.authorize('locations.manage')],
  }, async (request) => {
    const context = tenant(request);
    const { locationId } = locationIdParamsSchema.parse(request.params);
    const input = updateCanonicalListingSchema.parse(request.body);
    const patch = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.website !== undefined ? { website: input.website } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
      ...(input.region !== undefined ? { region: input.region } : {}),
      ...(input.city !== undefined ? { city: input.city } : {}),
      ...(input.addressLine1 !== undefined ? { addressLine1: input.addressLine1 } : {}),
      ...(input.addressLine2 !== undefined ? { addressLine2: input.addressLine2 } : {}),
      ...(input.postalCode !== undefined ? { postalCode: input.postalCode } : {}),
      ...(input.regularHours !== undefined ? { regularHours: input.regularHours } : {}),
      ...(input.categories !== undefined ? { categories: input.categories } : {}),
      ...(input.attributes !== undefined ? { attributes: input.attributes } : {}),
      ...(input.images !== undefined ? { images: input.images } : {}),
    };
    return { location: await updateCanonicalLocation(app, context, locationId, patch) };
  });

  app.post('/listing-health/locations/:locationId/sources', {
    preHandler: [app.authenticate, app.authorize('integrations.manage')],
  }, async (request, reply) => {
    const context = tenant(request);
    const { locationId } = locationIdParamsSchema.parse(request.params);
    const source = await createListingSource(app, context, locationId, createListingSourceSchema.parse(request.body));
    return reply.code(201).send({ source });
  });

  app.post('/listing-health/sources/:sourceId/sync', {
    preHandler: [app.authenticate, app.authorize('integrations.manage')],
  }, async (request, reply) => {
    const context = tenant(request);
    const { sourceId } = listingSourceIdParamsSchema.parse(request.params);
    const result = await enqueueListingSync(app, context, sourceId);
    return reply.code(result.deduplicated ? 200 : 202).send(result);
  });
};
