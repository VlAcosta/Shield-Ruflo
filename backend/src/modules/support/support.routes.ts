import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import {
  addClientSupportMessage,
  getSupportAttachment,
  getSupportSnapshot,
  saveSupportPreference,
} from './support.service.js';

const channelParams = z.object({
  channelId: z.enum(['manager', 'technical']),
});

const preferenceSchema = z.object({
  activeChannel: z.enum(['manager', 'technical']),
}).strict();

const attachmentSchema = z.object({
  name: z.string().trim().min(1).max(180),
  size: z.number().int().positive().max(2 * 1024 * 1024),
  type: z.string().trim().max(120).default(''),
  dataBase64: z.string().min(1).max(2_800_000),
}).strict();

const messageSchema = z.object({
  text: z.string().trim().max(10_000).default(''),
  attachments: z.array(attachmentSchema).max(5).optional(),
}).strict().refine((value) => Boolean(value.text || value.attachments?.length), {
  message: 'Введите сообщение или прикрепите файл',
});

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

function idempotencyKey(request: FastifyRequest) {
  const header = request.headers['idempotency-key'];
  const value = Array.isArray(header) ? header[0] : header;
  const normalized = String(value || '').trim();
  return normalized ? normalized.slice(0, 160) : null;
}

export const supportRoutes: FastifyPluginAsync = async (app) => {
  app.get('/support', {
    preHandler: [app.authenticate, app.authorize('support.view')],
  }, async (request) => ({
    snapshot: await getSupportSnapshot(app, actor(request)),
  }));

  app.patch('/support/preferences', {
    preHandler: [app.authenticate, app.authorize('support.view')],
  }, async (request) => {
    const body = preferenceSchema.parse(request.body);
    return {
      snapshot: await saveSupportPreference(app, actor(request), body.activeChannel),
    };
  });

  app.get('/support/attachments/:attachmentId', {
    preHandler: [app.authenticate, app.authorize('support.view')],
  }, async (request, reply) => {
    const { attachmentId } = z.object({ attachmentId: z.string().uuid() }).parse(request.params);
    const file = await getSupportAttachment(app, attachmentId, actor(request).organizationId);
    reply.header('content-type', file.mimeType);
    reply.header('content-length', String(file.sizeBytes));
    reply.header('cache-control', 'private, no-store');
    reply.header('x-content-type-options', 'nosniff');
    reply.header('content-disposition', `attachment; filename="attachment"; filename*=UTF-8''${encodeURIComponent(file.name)}`);
    return reply.send(Buffer.from(file.content));
  });

  app.post('/support/channels/:channelId/messages', {
    bodyLimit: 12 * 1024 * 1024,
    preHandler: [app.authenticate, app.authorize('support.write')],
  }, async (request, reply) => {
    const { channelId } = channelParams.parse(request.params);
    const body = messageSchema.parse(request.body);
    const result = await addClientSupportMessage(app, actor(request), channelId, {
      text: body.text,
      ...(body.attachments !== undefined ? { attachments: body.attachments } : {}),
      idempotencyKey: idempotencyKey(request),
    });

    return reply.code(201).send({
      message: {
        id: result.message.id,
        createdAt: result.message.createdAt,
      },
      ticket: {
        id: result.ticket.id,
        status: result.ticket.status,
      },
      snapshot: result.snapshot,
    });
  });
};
