import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { addChecklistItem, addTaskComment, createTask, listTasks, updateChecklistItem, updateTask } from './tasks.service.js';

const statusSchema = z.enum(['new', 'progress', 'in_progress', 'waiting', 'done', 'archived', 'NEW', 'IN_PROGRESS', 'WAITING', 'DONE', 'ARCHIVED']);
const prioritySchema = z.enum(['critical', 'high', 'medium', 'low', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW']);
const taskIdParams = z.object({ taskId: z.string().uuid() });
const checklistParams = z.object({ taskId: z.string().uuid(), itemId: z.string().uuid() });
const createSchema = z.object({
  title: z.string().trim().min(1).max(240),
  description: z.string().max(20_000).optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  deadline: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  businessId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  reviewId: z.string().uuid().nullable().optional(),
  assigneeMemberIds: z.array(z.string().uuid()).max(50).optional(),
});
const updateSchema = createSchema.partial().extend({ position: z.number().int().min(0).optional() });
const moveSchema = z.object({ status: statusSchema, beforeTaskId: z.string().uuid().nullable().optional() });
const commentSchema = z.object({ text: z.string().trim().min(1).max(10_000) });
const checklistCreateSchema = z.object({ text: z.string().trim().min(1).max(400) });
const checklistUpdateSchema = z.object({ completed: z.boolean() });

function context(request: FastifyRequest) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return { organizationId: request.auth.organizationId, userId: request.auth.userId };
}

export const tasksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/tasks', { preHandler: [app.authenticate, app.authorize('tasks.view')] }, async (request) => {
    return listTasks(app, context(request).organizationId);
  });

  app.post('/tasks', { preHandler: [app.authenticate, app.authorize('tasks.manage')] }, async (request, reply) => {
    const body = createSchema.parse(request.body);
    const task = await createTask(app, context(request), body);
    return reply.code(201).send({ task });
  });

  app.patch('/tasks/:taskId', { preHandler: [app.authenticate, app.authorize('tasks.manage')] }, async (request) => {
    const { taskId } = taskIdParams.parse(request.params);
    const task = await updateTask(app, context(request), taskId, updateSchema.parse(request.body));
    return { task };
  });

  app.patch('/tasks/:taskId/move', { preHandler: [app.authenticate, app.authorize('tasks.manage')] }, async (request) => {
    const { taskId } = taskIdParams.parse(request.params);
    const body = moveSchema.parse(request.body);
    const tenant = context(request);
    const before = body.beforeTaskId
      ? await app.prisma.task.findFirst({ where: { id: body.beforeTaskId, organizationId: tenant.organizationId }, select: { position: true } })
      : null;
    const task = await updateTask(app, tenant, taskId, {
      status: body.status,
      position: before?.position ?? 999_999,
    });
    return { task };
  });

  app.post('/tasks/:taskId/comments', { preHandler: [app.authenticate, app.authorize('tasks.manage')] }, async (request, reply) => {
    const { taskId } = taskIdParams.parse(request.params);
    const { text } = commentSchema.parse(request.body);
    const comment = await addTaskComment(app, context(request), taskId, text);
    return reply.code(201).send({ comment });
  });

  app.post('/tasks/:taskId/checklist', { preHandler: [app.authenticate, app.authorize('tasks.manage')] }, async (request, reply) => {
    const { taskId } = taskIdParams.parse(request.params);
    const { text } = checklistCreateSchema.parse(request.body);
    const item = await addChecklistItem(app, context(request).organizationId, taskId, text);
    return reply.code(201).send({ item });
  });

  app.patch('/tasks/:taskId/checklist/:itemId', { preHandler: [app.authenticate, app.authorize('tasks.manage')] }, async (request) => {
    const { taskId, itemId } = checklistParams.parse(request.params);
    const { completed } = checklistUpdateSchema.parse(request.body);
    const item = await updateChecklistItem(app, context(request).organizationId, taskId, itemId, completed);
    return { item };
  });

  app.patch('/tasks/preferences', { preHandler: [app.authenticate, app.authorize('tasks.view')] }, async () => {
    return { preferences: { view: 'board' } };
  });
};
