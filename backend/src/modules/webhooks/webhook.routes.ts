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
    const input = updateWebhookEndpointSchema.parse(request.body);
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
  }, async (request) => listWebhookDeliveries(app, request, webhookDeliveryQuerySchema.parse(request.query)));

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
