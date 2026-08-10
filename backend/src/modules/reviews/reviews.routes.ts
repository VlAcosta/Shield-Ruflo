import type { FastifyPluginAsync } from 'fastify';
import {
  assignmentIdParamsSchema,
  assignReviewSchema,
  createSourceSchema,
  createTagSchema,
  listReviewsQuerySchema,
  rejectReplySchema,
  replySchema,
  reviewIdParamsSchema,
  reviewReplyIdParamsSchema,
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
import {
  approveReply,
  createVersionedDraft,
  listReplyHistory,
  rejectReply,
  requestPublishReply,
  submitReplyForApproval,
} from './review-replies.service.js';
import { dispatchAutomationEvent } from '../operations/automation-engine.js';

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

  app.post('/reviews/:reviewId/replies/:replyId/submit', { preHandler: [app.authenticate, app.authorize('reviews.reply')] }, async (request) => {
    const { reviewId, replyId } = reviewReplyIdParamsSchema.parse(request.params);
    return submitReplyForApproval(app, request, reviewId, replyId);
  });

  app.post('/reviews/:reviewId/replies/:replyId/approve', { preHandler: [app.authenticate, app.authorize('reviews.approve')] }, async (request) => {
    const { reviewId, replyId } = reviewReplyIdParamsSchema.parse(request.params);
    return approveReply(app, request, reviewId, replyId);
  });

  app.post('/reviews/:reviewId/replies/:replyId/reject', { preHandler: [app.authenticate, app.authorize('reviews.approve')] }, async (request) => {
    const { reviewId, replyId } = reviewReplyIdParamsSchema.parse(request.params);
    const { reason } = rejectReplySchema.parse(request.body ?? {});
    return rejectReply(app, request, reviewId, replyId, reason);
  });

  app.post('/reviews/:reviewId/replies/:replyId/publish', { preHandler: [app.authenticate, app.authorize('reviews.approve')] }, async (request) => {
    const { reviewId, replyId } = reviewReplyIdParamsSchema.parse(request.params);
    return requestPublishReply(app, request, reviewId, replyId);
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

  // Protected idempotent import path. The provider/source external ID uniqueness
  // guarantee makes repeated imports safe, while automation execution has its own
  // dedupe key so the same provider review cannot create duplicate operational work.
  app.post('/reviews/import', { preHandler: [app.authenticate, app.authorize('reviews.settings')] }, async (request) => {
    const body = seedReviewSchema.parse(request.body);
    const result = await seedReview(app, request, body);
    const review = result.review;
    const automationResults = await dispatchAutomationEvent(app, {
      type: 'new_review',
      organizationId: request.auth!.organizationId!,
      actorUserId: request.auth!.userId,
      dedupeKey: `${review.sourceId}:${review.externalId}`,
      review: {
        id: review.id,
        rating: review.rating,
        businessId: review.businessId,
        locationId: review.locationId,
        author: review.author,
        provider: review.provider,
      },
    });
    return { ...result, automations: automationResults };
  });
};
