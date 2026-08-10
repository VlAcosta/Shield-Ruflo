import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';

const automationIdParams = z.object({ automationId: z.string().uuid() });
const reportIdParams = z.object({ reportId: z.string().uuid() });
const notificationIdParams = z.object({ notificationId: z.string().uuid() });
const automationSchema = z.object({
  name: z.string().trim().min(1).max(180),
  trigger: z.enum(['negative_review', 'rating_at_most', 'new_review', 'unanswered_age']),
  conditions: z.record(z.string(), z.unknown()).default({}),
  actions: z.array(z.object({ type: z.enum(['create_task', 'assign_manager', 'notify']), config: z.record(z.string(), z.unknown()).default({}) })).min(1).max(10),
  enabled: z.boolean().default(true),
});
const automationPatchSchema = automationSchema.partial();
const reportSchema = z.object({
  type: z.enum(['weekly_reputation', 'monthly_reputation', 'custom']).default('custom'),
  title: z.string().trim().min(1).max(240),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

function authContext(request: { auth?: { organizationId?: string | null; userId: string } }) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return { organizationId: request.auth.organizationId, userId: request.auth.userId };
}

export const operationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/automations', { preHandler: [app.authenticate, app.authorize('automations.view')] }, async (request) => {
    const { organizationId } = authContext(request);
    const automations = await app.prisma.automation.findMany({
      where: { organizationId },
      include: { executions: { orderBy: { startedAt: 'desc' }, take: 5 } },
      orderBy: { createdAt: 'desc' },
    });
    return { automations };
  });

  app.post('/automations', { preHandler: [app.authenticate, app.authorize('automations.manage')] }, async (request, reply) => {
    const { organizationId, userId } = authContext(request);
    const body = automationSchema.parse(request.body);
    const automation = await app.prisma.automation.create({ data: { organizationId, ...body } });
    await app.prisma.auditLog.create({
      data: { organizationId, actorUserId: userId, action: 'automation.created', entityType: 'Automation', entityId: automation.id },
    });
    return reply.code(201).send({ automation });
  });

  app.patch('/automations/:automationId', { preHandler: [app.authenticate, app.authorize('automations.manage')] }, async (request) => {
    const { organizationId, userId } = authContext(request);
    const { automationId } = automationIdParams.parse(request.params);
    const current = await app.prisma.automation.findFirst({ where: { id: automationId, organizationId }, select: { id: true } });
    if (!current) throw new AppError({ code: 'AUTOMATION_NOT_FOUND', message: 'Автоматизация не найдена', statusCode: 404 });
    const automation = await app.prisma.automation.update({ where: { id: current.id }, data: automationPatchSchema.parse(request.body) });
    await app.prisma.auditLog.create({
      data: { organizationId, actorUserId: userId, action: 'automation.updated', entityType: 'Automation', entityId: automation.id },
    });
    return { automation };
  });

  app.get('/reports', { preHandler: [app.authenticate, app.authorize('analytics.view')] }, async (request) => {
    const { organizationId } = authContext(request);
    return { reports: await app.prisma.report.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 100 }) };
  });

  app.post('/reports', { preHandler: [app.authenticate, app.authorize('analytics.view')] }, async (request, reply) => {
    const { organizationId } = authContext(request);
    const body = reportSchema.parse(request.body);
    const start = new Date(body.periodStart);
    const end = new Date(body.periodEnd);
    if (start >= end) throw new AppError({ code: 'INVALID_REPORT_PERIOD', message: 'Некорректный период отчёта', statusCode: 422 });

    const report = await app.prisma.$transaction(async (tx) => {
      const row = await tx.report.create({
        data: { organizationId, type: body.type, title: body.title, periodStart: start, periodEnd: end, status: 'QUEUED' },
      });
      await tx.job.create({
        data: {
          organizationId,
          type: 'report.generate',
          payload: { reportId: row.id },
          dedupeKey: `report:${row.id}`,
          maxAttempts: 3,
        },
      });
      return row;
    });
    return reply.code(202).send({ report });
  });

  app.get('/reports/:reportId', { preHandler: [app.authenticate, app.authorize('analytics.view')] }, async (request) => {
    const { organizationId } = authContext(request);
    const { reportId } = reportIdParams.parse(request.params);
    const report = await app.prisma.report.findFirst({ where: { id: reportId, organizationId } });
    if (!report) throw new AppError({ code: 'REPORT_NOT_FOUND', message: 'Отчёт не найден', statusCode: 404 });
    return { report };
  });

  app.get('/notifications', { preHandler: [app.authenticate] }, async (request) => {
    const { organizationId, userId } = authContext(request);
    const notifications = await app.prisma.notification.findMany({
      where: { organizationId, OR: [{ userId }, { userId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { notifications };
  });

  app.patch('/notifications/:notificationId/read', { preHandler: [app.authenticate] }, async (request) => {
    const { organizationId, userId } = authContext(request);
    const { notificationId } = notificationIdParams.parse(request.params);
    const notification = await app.prisma.notification.findFirst({
      where: { id: notificationId, organizationId, OR: [{ userId }, { userId: null }] },
      select: { id: true },
    });
    if (!notification) throw new AppError({ code: 'NOTIFICATION_NOT_FOUND', message: 'Уведомление не найдено', statusCode: 404 });
    return {
      notification: await app.prisma.notification.update({ where: { id: notification.id }, data: { status: 'READ', readAt: new Date() } }),
    };
  });
};
