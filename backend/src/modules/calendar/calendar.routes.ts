import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
  type CalendarActor,
} from './calendar.service.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
const typeSchema = z.enum(['work', 'report', 'meeting', 'deadline', 'sla']);
const toneSchema = z.enum(['violet', 'cyan', 'green', 'orange', 'red']);
const eventParams = z.object({ eventId: z.string().uuid() });
const listQuery = z.object({ from: dateSchema.optional(), to: dateSchema.optional() }).strict();
const createSchema = z.object({
  title: z.string().trim().min(1).max(240),
  date: dateSchema,
  time: timeSchema.default('10:00'),
  type: typeSchema,
  tone: toneSchema,
  note: z.string().max(10_000).optional(),
}).strict();
const updateSchema = createSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'Нужно передать хотя бы одно изменяемое поле',
});

function actor(request: FastifyRequest): CalendarActor {
  if (!request.auth?.organizationId) {
    throw new AppError({
      code: 'ORGANIZATION_CONTEXT_REQUIRED',
      message: 'Рабочее пространство не выбрано',
      statusCode: 409,
    });
  }
  return {
    organizationId: request.auth.organizationId,
    userId: request.auth.userId,
    ipAddress: request.ip || '',
    userAgent: String(request.headers['user-agent'] || ''),
  };
}

function idempotencyKey(request: FastifyRequest): string | undefined {
  const raw = request.headers['idempotency-key'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const normalized = String(value).trim();
  if (!normalized) return undefined;
  if (normalized.length > 128) {
    throw new AppError({ code: 'IDEMPOTENCY_KEY_INVALID', message: 'Idempotency-Key слишком длинный', statusCode: 400 });
  }
  return normalized;
}

export const calendarRoutes: FastifyPluginAsync = async (app) => {
  app.get('/calendar/events', {
    preHandler: [app.authenticate, app.authorize('calendar.view')],
  }, async (request) => {
    const query = listQuery.parse(request.query);
    const currentActor = actor(request);
    if (query.from && query.to && query.from > query.to) {
      throw new AppError({ code: 'CALENDAR_RANGE_INVALID', message: 'Начало периода не может быть позже конца', statusCode: 400 });
    }
    return {
      items: await listCalendarEvents(app, currentActor.organizationId, query),
    };
  });

  app.post('/calendar/events', {
    preHandler: [app.authenticate, app.authorize('calendar.manage')],
  }, async (request, reply) => {
    const event = await createCalendarEvent(app, actor(request), createSchema.parse(request.body), idempotencyKey(request));
    return reply.code(201).send({ event });
  });

  app.patch('/calendar/events/:eventId', {
    preHandler: [app.authenticate, app.authorize('calendar.manage')],
  }, async (request) => {
    const { eventId } = eventParams.parse(request.params);
    return {
      event: await updateCalendarEvent(app, actor(request), eventId, updateSchema.parse(request.body)),
    };
  });

  app.delete('/calendar/events/:eventId', {
    preHandler: [app.authenticate, app.authorize('calendar.manage')],
  }, async (request) => {
    const { eventId } = eventParams.parse(request.params);
    await deleteCalendarEvent(app, actor(request), eventId);
    return { deleted: true };
  });
};
