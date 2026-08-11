import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import {
  acquisitionMetricsQuerySchema,
  campaignIdParamsSchema,
  campaignListQuerySchema,
  createCampaignSchema,
  createInviteSchema,
  feedbackListQuerySchema,
  publicCampaignParamsSchema,
  publicCampaignQuerySchema,
  submitFeedbackSchema,
  targetClickParamsSchema,
  updateCampaignSchema,
} from './acquisition.schemas.js';
import {
  acquisitionMetrics,
  createCampaign,
  createInvite,
  getCampaign,
  getPublicCampaign,
  listCampaigns,
  listFeedback,
  recordReviewTargetClick,
  submitPublicFeedback,
  updateCampaign,
} from './acquisition.service.js';

function tenant(request: FastifyRequest) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return { organizationId: request.auth.organizationId, userId: request.auth.userId };
}

export const acquisitionRoutes: FastifyPluginAsync = async (app) => {
  app.get('/acquisition/campaigns', { preHandler: [app.authenticate, app.authorize('acquisition.view')] }, async (request) => {
    const context = tenant(request);
    const query = campaignListQuerySchema.parse(request.query);
    return listCampaigns(app, context.organizationId, {
      limit: query.limit,
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.locationId !== undefined ? { locationId: query.locationId } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
  });

  app.post('/acquisition/campaigns', { preHandler: [app.authenticate, app.authorize('acquisition.manage')] }, async (request, reply) => {
    const context = tenant(request);
    const campaign = await createCampaign(app, context, createCampaignSchema.parse(request.body));
    return reply.code(201).send({ campaign });
  });

  app.get('/acquisition/campaigns/:campaignId', { preHandler: [app.authenticate, app.authorize('acquisition.view')] }, async (request) => {
    const context = tenant(request);
    const { campaignId } = campaignIdParamsSchema.parse(request.params);
    return { campaign: await getCampaign(app, context.organizationId, campaignId) };
  });

  app.patch('/acquisition/campaigns/:campaignId', { preHandler: [app.authenticate, app.authorize('acquisition.manage')] }, async (request) => {
    const context = tenant(request);
    const { campaignId } = campaignIdParamsSchema.parse(request.params);
    return { campaign: await updateCampaign(app, context, campaignId, updateCampaignSchema.parse(request.body)) };
  });

  app.post('/acquisition/campaigns/:campaignId/invites', { preHandler: [app.authenticate, app.authorize('acquisition.manage')] }, async (request, reply) => {
    const context = tenant(request);
    const { campaignId } = campaignIdParamsSchema.parse(request.params);
    const body = createInviteSchema.parse(request.body);
    const invite = await createInvite(app, context, campaignId, {
      channel: body.channel,
      expiresInDays: body.expiresInDays,
      ...(body.externalReference !== undefined ? { externalReference: body.externalReference } : {}),
    });
    return reply.code(201).send({ invite });
  });

  app.get('/acquisition/campaigns/:campaignId/feedback', { preHandler: [app.authenticate, app.authorize('acquisition.view')] }, async (request) => {
    const context = tenant(request);
    const { campaignId } = campaignIdParamsSchema.parse(request.params);
    const query = feedbackListQuerySchema.parse(request.query);
    return listFeedback(app, context.organizationId, campaignId, {
      limit: query.limit,
      ...(query.rating !== undefined ? { rating: query.rating } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
    });
  });

  app.get('/acquisition/campaigns/:campaignId/metrics', { preHandler: [app.authenticate, app.authorize('acquisition.view')] }, async (request) => {
    const context = tenant(request);
    const { campaignId } = campaignIdParamsSchema.parse(request.params);
    const query = acquisitionMetricsQuerySchema.parse(request.query);
    return acquisitionMetrics(app, context.organizationId, campaignId, {
      ...(query.from !== undefined ? { from: query.from } : {}),
      ...(query.to !== undefined ? { to: query.to } : {}),
    });
  });

  // Public endpoints intentionally do not use the authenticated organization context.
  // Tenant ownership is resolved only through a high-entropy campaign slug/invite token.
  app.get('/public/review-acquisition/:slug', async (request) => {
    const { slug } = publicCampaignParamsSchema.parse(request.params);
    const query = publicCampaignQuerySchema.parse(request.query);
    return getPublicCampaign(app, slug, {
      ...(query.invite !== undefined ? { invite: query.invite } : {}),
      ...(query.session !== undefined ? { session: query.session } : {}),
    });
  });

  app.post('/public/review-acquisition/:slug/feedback', async (request, reply) => {
    const { slug } = publicCampaignParamsSchema.parse(request.params);
    const body = submitFeedbackSchema.parse(request.body);
    return reply.code(201).send(await submitPublicFeedback(app, slug, {
      rating: body.rating,
      text: body.text,
      consentToContact: body.consentToContact,
      ...(body.contactName !== undefined ? { contactName: body.contactName } : {}),
      ...(body.contactEmail !== undefined ? { contactEmail: body.contactEmail } : {}),
      ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone } : {}),
      ...(body.invite !== undefined ? { invite: body.invite } : {}),
      ...(body.session !== undefined ? { session: body.session } : {}),
    }));
  });

  app.get('/public/review-acquisition/:slug/targets/:targetId', async (request, reply) => {
    const { slug, targetId } = targetClickParamsSchema.parse(request.params);
    const query = publicCampaignQuerySchema.parse(request.query);
    const result = await recordReviewTargetClick(app, slug, targetId, {
      ...(query.invite !== undefined ? { invite: query.invite } : {}),
      ...(query.session !== undefined ? { session: query.session } : {}),
    });
    return reply.redirect(result.url);
  });
};
