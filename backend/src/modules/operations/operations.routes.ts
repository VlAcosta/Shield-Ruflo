import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { assertEntitlement } from '../billing/billing.service.js';

const automationIdParams = z.object({ automationId: z.string().uuid() });
const reportIdParams = z.object({ reportId: z.string().uuid() });
const notificationIdParams = z.object({ notificationId: z.string().uuid() });
const jsonObjectSchema = z.record(z.string(), z.unknown());
const automationActionSchema = z.union([
  z.string().trim().min(1).max(120),
  z.object({
    type: z.string().trim().min(1).max(120),
    config: jsonObjectSchema.default({}),
  }),
]);
const automationSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(500).optional(),
  trigger: z.string().trim().min(1).max(120),
  conditions: jsonObjectSchema.default({}),
  actions: z.array(automationActionSchema).min(1).max(10),
  enabled: z.boolean().default(true),
});
const automationPatchSchema = automationSchema.partial();
const reportSchema = z.object({
  type: z.enum(['weekly_reputation', 'monthly_reputation', 'custom']).default('custom'),
  title: z.string().trim().min(1).max(240),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});
const notificationPreferencesSchema = z.record(z.string(), z.unknown());

function authContext(request: { auth?: { organizationId?: string | null; userId: string } }) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return { organizationId: request.auth.organizationId, userId: request.auth.userId };
}

async function createQueuedReport(
  app: Parameters<FastifyPluginAsync>[0],
  organizationId: string,
  body: z.infer<typeof reportSchema>,
) {
  const start = new Date(body.periodStart);
  const end = new Date(body.periodEnd);
  if (start >= end) {
    throw new AppError({ code: 'INVALID_REPORT_PERIOD', message: 'Некорректный период отчёта', statusCode: 422 });
  }

  return app.prisma.$transaction(async (tx) => {
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
    await assertEntitlement(app, organizationId, 'automations');
    const body = automationSchema.parse(request.body);
    const automation = await app.prisma.automation.create({
      data: {
        organizationId,
        name: body.name,
        trigger: body.trigger,
        conditions: body.conditions,
        actions: body.actions,
        enabled: body.enabled,
      },
    });
    await app.prisma.auditLog.create({
      data: { organizationId, actorUserId: userId, action: 'automation.created', entityType: 'Automation', entityId: automation.id },
    });
    return reply.code(201).send({ automation });
  });

  app.patch('/automations/:automationId', { preHandler: [app.authenticate, app.authorize('automations.manage')] }, async (request) => {
    const { organizationId, userId } = authContext(request);
    await assertEntitlement(app, organizationId, 'automations');
    const { automationId } = automationIdParams.parse(request.params);
    const current = await app.prisma.automation.findFirst({ where: { id: automationId, organizationId }, select: { id: true } });
    if (!current) throw new AppError({ code: 'AUTOMATION_NOT_FOUND', message: 'Автоматизация не найдена', statusCode: 404 });
    const body = automationPatchSchema.parse(request.body);
    const automation = await app.prisma.automation.update({
      where: { id: current.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.trigger !== undefined ? { trigger: body.trigger } : {}),
        ...(body.conditions !== undefined ? { conditions: body.conditions } : {}),
        ...(body.actions !== undefined ? { actions: body.actions } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
      },
    });
    await app.prisma.auditLog.create({
      data: { organizationId, actorUserId: userId, action: 'automation.updated', entityType: 'Automation', entityId: automation.id },
    });
    return { automation };
  });

  app.get('/reports', { preHandler: [app.authenticate, app.authorize('analytics.view')] }, async (request) => {
    const { organizationId } = authContext(request);
    await assertEntitlement(app, organizationId, 'reports');
    return { reports: await app.prisma.report.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' }, take: 100 }), schedules: [] };
  });

  const createReportHandler = async (request: Parameters<typeof authContext>[0] & { body?: unknown }, reply: any) => {
    const { organizationId } = authContext(request);
    await assertEntitlement(app, organizationId, 'reports');
    const report = await createQueuedReport(app, organizationId, reportSchema.parse(request.body));
    return reply.code(202).send({ report });
  };

  app.post('/reports', { preHandler: [app.authenticate, app.authorize('analytics.view')] }, createReportHandler);
  app.post('/reports/generate', { preHandler: [app.authenticate, app.authorize('analytics.view')] }, createReportHandler);

  app.get('/reports/:reportId', { preHandler: [app.authenticate, app.authorize('analytics.view')] }, async (request) => {
    const { organizationId } = authContext(request);
    await assertEntitlement(app, organizationId, 'reports');
    const { reportId } = reportIdParams.parse(request.params);
    const report = await app.prisma.report.findFirst({ where: { id: reportId, organizationId } });
    if (!report) throw new AppError({ code: 'REPORT_NOT_FOUND', message: 'Отчёт не найден', statusCode: 404 });
    return { report };
  });

  app.put('/reports/schedules', { preHandler: [app.authenticate, app.authorize('analytics.view')] }, async (request) => {
    const { organizationId } = authContext(request);
    await assertEntitlement(app, organizationId, 'reports');
    // Scheduled report execution will use Automations/Jobs. Until a schedule is
    // persisted server-side we do not claim that a local UI toggle is active.
    const { schedules } = z.object({ schedules: z.array(z.unknown()).max(50) }).parse(request.body);
    if (schedules.length) {
      throw new AppError({ code: 'REPORT_SCHEDULING_NOT_CONFIGURED', message: 'Планировщик отчётов ещё не настроен', statusCode: 422 });
    }
    return { schedules: [] };
  });

  app.get('/notifications', { preHandler: [app.authenticate] }, async (request) => {
    const { organizationId, userId } = authContext(request);
    const [notifications, user] = await Promise.all([
      app.prisma.notification.findMany({
        where: { organizationId, OR: [{ userId }, { userId: null }] },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      app.prisma.user.findUnique({ where: { id: userId }, select: { notificationPreferences: true } }),
    ]);
    const stored = user?.notificationPreferences && typeof user.notificationPreferences === 'object' && !Array.isArray(user.notificationPreferences)
      ? user.notificationPreferences as Record<string, unknown>
      : {};
    return {
      notifications,
      preferences: stored.preferences ?? {},
      settings: stored.settings ?? {},
    };
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

  app.patch('/notifications/read-all', { preHandler: [app.authenticate] }, async (request) => {
    const { organizationId, userId } = authContext(request);
    const result = await app.prisma.notification.updateMany({
      where: { organizationId, status: 'UNREAD', OR: [{ userId }, { userId: null }] },
      data: { status: 'READ', readAt: new Date() },
    });
    return { ok: true, updated: result.count };
  });

  async function updateNotificationConfig(userId: string, section: 'preferences' | 'settings', value: Record<string, unknown>) {
    const user = await app.prisma.user.findUnique({ where: { id: userId }, select: { notificationPreferences: true } });
    const current = user?.notificationPreferences && typeof user.notificationPreferences === 'object' && !Array.isArray(user.notificationPreferences)
      ? user.notificationPreferences as Record<string, unknown>
      : {};
    const next = { ...current, [section]: value };
    await app.prisma.user.update({ where: { id: userId }, data: { notificationPreferences: next } });
    return value;
  }

  app.patch('/notifications/preferences', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = authContext(request);
    const preferences = notificationPreferencesSchema.parse(request.body);
    return { preferences: await updateNotificationConfig(userId, 'preferences', preferences) };
  });

  app.patch('/notifications/settings', { preHandler: [app.authenticate] }, async (request) => {
    const { userId } = authContext(request);
    const settings = notificationPreferencesSchema.parse(request.body);
    return { settings: await updateNotificationConfig(userId, 'settings', settings) };
  });
};
