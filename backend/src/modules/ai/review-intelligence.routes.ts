import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { assertEntitlement } from '../billing/billing.service.js';
import { reviewIdParamsSchema } from './review-intelligence.schemas.js';
import { enqueueReviewAnalysis, getReviewIntelligenceState } from './review-intelligence.service.js';

export const reviewIntelligenceRoutes: FastifyPluginAsync = async (app) => {
  app.get('/reviews/:reviewId/intelligence', {
    preHandler: [app.authenticate, app.authorize('reviews.intelligence.read')],
  }, async (request) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    const organizationId = request.auth!.organizationId!;
    const state = await getReviewIntelligenceState(app.prisma, organizationId, reviewId);
    if (!state) throw new AppError({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден', statusCode: 404 });
    return state;
  });

  app.post('/reviews/:reviewId/intelligence/reanalyze', {
    preHandler: [app.authenticate, app.authorize('reviews.intelligence.reanalyze')],
  }, async (request, reply) => {
    const { reviewId } = reviewIdParamsSchema.parse(request.params);
    const organizationId = request.auth!.organizationId!;
    await assertEntitlement(app, organizationId, 'ai.review_intelligence');
    const state = await getReviewIntelligenceState(app.prisma, organizationId, reviewId);
    if (!state) throw new AppError({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден', statusCode: 404 });
    if (!state.providerState.available) {
      throw new AppError({
        code: state.providerState.reasonCode ?? 'AI_PROVIDER_UNAVAILABLE',
        message: state.providerState.reasonMessage ?? 'AI provider недоступен',
        statusCode: 422,
      });
    }
    const queued = await enqueueReviewAnalysis(app.prisma, { organizationId, reviewId, force: true });
    if (!queued.queued) throw new AppError({ code: queued.reason, message: 'Не удалось поставить AI-анализ в очередь', statusCode: 409 });
    await app.prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: 'review.intelligence.reanalysis_requested',
        entityType: 'review',
        entityId: reviewId,
        metadata: { operationId: queued.operationId, jobId: queued.jobId },
        ipAddress: request.ip,
        userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
      },
    });
    return reply.code(202).send({ ok: true, operationId: queued.operationId, jobId: queued.jobId });
  });
};
