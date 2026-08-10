import type { FastifyPluginAsync } from 'fastify';
import {
  assignmentIdParamsSchema,
  assignReviewSchema,
  createSourceSchema,
  createTagSchema,
  listReviewsQuerySchema,
  replySchema,
  reviewIdParamsSchema,
  seedReviewSchema,
  sourceIdParamsSchema,
  updateReviewSchema,
  updateSourceSchema,
} from './reviews.schemas.js';
import {
  assignReview,
  createSource,
  createTag,
  getReview,
  listReviews,
  listSources,
  listTags,
  removeAssignment,
  seedReview,
  updateReview,
  updateSource,
} from './reviews.service.js';
import { createVersionedDraft, listReplyHistory } from './review-replies.service.js';

export const reviewsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/reviews', { preHandler: [app.authenticate, app.authorize('reviews.view')] }, async (request) => {
    return listReviews(app, request, listReviewsQuerySchema.parse(request.query));
  });

  app.get('/reviews/:reviewId', { preHandler: [app.authenticate, app.authorize('reviews.view')] }, async (request) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    return { review: await getReview(app, request.auth!.organizationId!, reviewId) };
  });

  app.patch('/reviews/:reviewId', { preHandler: [app.authenticate, app.authorize('reviews.moderate')] }, async (request) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    return updateReview(app, request, reviewId, updateReviewSchema.parse(request.body));
  });

  app.post('/reviews/:reviewId/reply', { preHandler: [app.authenticate, app.authorize('reviews.reply')] }, async (request) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    return createVersionedDraft(app, request, reviewId, replySchema.parse(request.body));
  });

  app.get('/reviews/:reviewId/replies', { preHandler: [app.authenticate, app.authorize('reviews.view')] }, async (request) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    return { items: await listReplyHistory(app, request.auth!.organizationId!, reviewId) };
  });

  app.post('/reviews/:reviewId/assignments', { preHandler: [app.authenticate, app.authorize('reviews.moderate')] }, async (request) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    const body = assignReviewSchema.parse(request.body);
    return assignReview(app, request, reviewId, body.memberId, body.note);
  });

  app.delete('/reviews/:reviewId/assignments/:assignmentId', { preHandler: [app.authenticate, app.authorize('reviews.moderate')] }, async (request) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    const { assignmentId } = assignmentIdParamsSchema.parse(request.params);
    return removeAssignment(app, request, reviewId, assignmentId);
  });

  app.get('/review-sources', { preHandler: [app.authenticate, app.authorize('reviews.view')] }, async (request) => {
    return { items: await listSources(app, request.auth!.organizationId!) };
  });

  app.post('/review-sources', { preHandler: [app.authenticate, app.authorize('reviews.settings')] }, async (request) => {
    return createSource(app, request, createSourceSchema.parse(request.body));
  });

  app.patch('/review-sources/:sourceId', { preHandler: [app.authenticate, app.authorize('reviews.settings')] }, async (request) => {
    const { sourceId } = sourceIdParamsSchema.parse(request.params);
    return updateSource(app, request, sourceId, updateSourceSchema.parse(request.body));
  });

  app.get('/review-tags', { preHandler: [app.authenticate, app.authorize('reviews.view')] }, async (request) => {
    return { items: await listTags(app, request.auth!.organizationId!) };
  });

  app.post('/review-tags', { preHandler: [app.authenticate, app.authorize('reviews.settings')] }, async (request) => {
    return createTag(app, request.auth!.organizationId!, createTagSchema.parse(request.body));
  });

  // Protected idempotent import path. Provider workers use the same source/external ID
  // uniqueness guarantee and never manufacture a successful external sync state.
  app.post('/reviews/import', { preHandler: [app.authenticate, app.authorize('reviews.settings')] }, async (request) => {
    return seedReview(app, request, seedReviewSchema.parse(request.body));
  });
};
