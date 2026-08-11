import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import {
  generateReplyBodySchema,
  reviewOperationParamsSchema,
  updateBrandVoiceSchema,
  updateReplyAutopilotSchema,
} from './reply-copilot.schemas.js';
import {
  enqueueAiReplyGeneration,
  getAiReplyOperation,
  getBrandVoice,
  getReplyAutopilot,
  saveBrandVoice,
  saveReplyAutopilot,
} from './reply-copilot.service.js';

export const replyCopilotRoutes: FastifyPluginAsync = async (app) => {
  app.get('/ai/brand-voice', {
    preHandler: [app.authenticate, app.authorize('reviews.view')],
  }, async (request) => ({ profile: await getBrandVoice(app.prisma, request.auth!.organizationId!) }));

  app.put('/ai/brand-voice', {
    preHandler: [app.authenticate, app.authorize('ai.brand_voice.manage')],
  }, async (request) => {
    const current = await getBrandVoice(app.prisma, request.auth!.organizationId!);
    const patch = updateBrandVoiceSchema.parse(request.body ?? {});
    return {
      profile: await saveBrandVoice(app.prisma, {
        organizationId: request.auth!.organizationId!,
        actorUserId: request.auth!.userId,
        value: { ...current, ...patch },
      }),
    };
  });

  app.get('/ai/reply-autopilot', {
    preHandler: [app.authenticate, app.authorize('reviews.view')],
  }, async (request) => ({ policy: await getReplyAutopilot(app.prisma, request.auth!.organizationId!) }));

  app.put('/ai/reply-autopilot', {
    preHandler: [app.authenticate, app.authorize('ai.autopilot.manage')],
  }, async (request) => {
    const current = await getReplyAutopilot(app.prisma, request.auth!.organizationId!);
    const patch = updateReplyAutopilotSchema.parse(request.body ?? {});
    return {
      policy: await saveReplyAutopilot(app.prisma, {
        organizationId: request.auth!.organizationId!,
        actorUserId: request.auth!.userId,
        value: { ...current, ...patch },
      }),
    };
  });

  app.post('/reviews/:reviewId/ai-reply', {
    preHandler: [app.authenticate, app.authorize('reviews.reply')],
  }, async (request, reply) => {
    const { reviewId } = reviewOperationParamsSchema.pick({ reviewId: true }).parse(request.params);
    const body = generateReplyBodySchema.parse(request.body ?? {});
    const result = await enqueueAiReplyGeneration(app.prisma, {
      organizationId: request.auth!.organizationId!,
      reviewId,
      actorUserId: request.auth!.userId,
      mode: body.mode,
      instructions: body.instructions,
    });
    return reply.code(202).send(result);
  });

  app.get('/reviews/:reviewId/ai-reply/:operationId', {
    preHandler: [app.authenticate, app.authorize('reviews.view')],
  }, async (request) => {
    const params = reviewOperationParamsSchema.parse(request.params);
    const operation = await getAiReplyOperation(app.prisma, request.auth!.organizationId!, params.reviewId, params.operationId);
    if (!operation) throw new AppError({ code: 'AI_REPLY_OPERATION_NOT_FOUND', message: 'Операция AI-ответа не найдена', statusCode: 404 });
    return { operation };
  });
};
