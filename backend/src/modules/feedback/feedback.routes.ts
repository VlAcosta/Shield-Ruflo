import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { createProductSuggestion } from './feedback.service.js';

const suggestionSchema = z.object({
  category: z.string().trim().min(1).max(120).default('Другое'),
  subject: z.string().trim().min(1).max(240).default('Предложение по продукту'),
  message: z.string().trim().min(3).max(20_000),
  name: z.string().trim().max(180).optional(),
  email: z.union([z.literal(''), z.string().email().max(320)]).optional(),
}).strict();

function actor(request: FastifyRequest) {
  const organizationId = request.auth?.organizationId;
  const userId = request.auth?.userId;
  if (!organizationId || !userId) {
    throw new AppError({
      code: 'ORGANIZATION_CONTEXT_REQUIRED',
      message: 'Рабочее пространство не выбрано',
      statusCode: 409,
    });
  }
  return { organizationId, userId };
}

export const feedbackRoutes: FastifyPluginAsync = async (app) => {
  app.post('/feedback/suggestions', {
    preHandler: [app.authenticate],
  }, async (request, reply) => {
    const body = suggestionSchema.parse(request.body);
    const suggestion = await createProductSuggestion(app, actor(request), {
      category: body.category,
      subject: body.subject,
      message: body.message,
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
    });
    return reply.code(201).send({
      suggestion: {
        id: suggestion.id,
        status: suggestion.status,
        deliveryStatus: suggestion.deliveryStatus,
        createdAt: suggestion.createdAt,
      },
      persisted: true,
    });
  });
};
