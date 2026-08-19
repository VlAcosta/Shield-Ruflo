import type { FastifyPluginAsync } from 'fastify';
import {
  createWebhookEndpointSchema,
  updateWebhookEndpointSchema,
  webhookDeliveryParamsSchema,
  webhookDeliveryQuerySchema,
  webhookEndpointParamsSchema,
} from './webhook.schemas.js';
import {
  createWebhookEndpoint,
  getWebhookDelivery,
  listWebhookDeliveries,
  listWebhookEndpoints,
  retryWebhookDelivery,
  revokeWebhookEndpoint,
  rotateWebhookSecret,
  updateWebhookEndpoint,
} from './webhook.service.js';

export const webhookRoutes: FastifyPluginAsync = async (app) => {
  app.get('/webhooks/endpoints', {
    preHandler: [app.authenticate, app.authorize('webhooks.view')],
  }, async (request) => listWebhookEndpoints(app, request));

  app.post('/webhooks/endpoints', {
    preHandler: [app.authenticate, app.authorize('webhooks.manage')],
  }, async (request, reply) => {
    const result = await createWebhookEndpoint(app, request, createWebhookEndpointSchema.parse(request.body));
    return reply.code(201).send(result);
  });

  app.patch('/webhooks/endpoints/:endpointId', {
    preHandler: [app.authenticate, app.authorize('webhooks.manage')],
  }, async (request) => {
    const { endpointId } = webhookEndpointParamsSchema.parse(request.params);
    const parsed = updateWebhookEndpointSchema.parse(request.body);
    const input = {
      ...(parsed.name === undefined ? {} : { name: parsed.name }),
      ...(parsed.url === undefined ? {} : { url: parsed.url }),
      ...(parsed.events === undefined ? {} : { events: parsed.events }),
      ...(parsed.status === undefined ? {} : { status: parsed.status }),
    };
    return updateWebhookEndpoint(app, request, endpointId, input);
  });

  app.post('/webhooks/endpoints/:endpointId/rotate-secret', {
    preHandler: [app.authenticate, app.authorize('webhooks.manage')],
  }, async (request) => {
    const { endpointId } = webhookEndpointParamsSchema.parse(request.params);
    return rotateWebhookSecret(app, request, endpointId);
  });

  app.post('/webhooks/endpoints/:endpointId/revoke', {
    preHandler: [app.authenticate, app.authorize('webhooks.manage')],
  }, async (request) => {
    const { endpointId } = webhookEndpointParamsSchema.parse(request.params);
    return revokeWebhookEndpoint(app, request, endpointId);
  });

  app.get('/webhooks/deliveries', {
    preHandler: [app.authenticate, app.authorize('webhooks.view')],
  }, async (request) => {
    const parsed = webhookDeliveryQuerySchema.parse(request.query);
    const query = {
      page: parsed.page,
      pageSize: parsed.pageSize,
      ...(parsed.endpointId === undefined ? {} : { endpointId: parsed.endpointId }),
      ...(parsed.status === undefined ? {} : { status: parsed.status }),
      ...(parsed.eventType === undefined ? {} : { eventType: parsed.eventType }),
    };
    return listWebhookDeliveries(app, request, query);
  });

  app.get('/webhooks/deliveries/:deliveryId', {
    preHandler: [app.authenticate, app.authorize('webhooks.view')],
  }, async (request) => {
    const { deliveryId } = webhookDeliveryParamsSchema.parse(request.params);
    return getWebhookDelivery(app, request, deliveryId);
  });

  app.post('/webhooks/deliveries/:deliveryId/retry', {
    preHandler: [app.authenticate, app.authorize('webhooks.manage')],
  }, async (request) => {
    const { deliveryId } = webhookDeliveryParamsSchema.parse(request.params);
    return retryWebhookDelivery(app, request, deliveryId);
  });
};
