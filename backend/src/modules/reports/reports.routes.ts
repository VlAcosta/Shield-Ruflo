import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { assertEntitlement } from '../billing/billing.service.js';
import {
  enqueueReport,
  getReport,
  listReports,
  saveReportSchedules,
} from './reports.service.js';

const reportIdParams = z.object({ reportId: z.string().uuid() });
const generateSchema = z.object({
  type: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(240),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  requestedBlocks: z.array(z.string().trim().min(1).max(80)).max(40).optional(),
}).strict();
const scheduleSchema = z.object({
  id: z.string().trim().min(1).max(120),
  title: z.string().trim().min(1).max(180),
  day: z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  dayLabel: z.string().trim().min(1).max(24),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  channel: z.enum(['email', 'telegram']),
  channelLabel: z.string().trim().min(1).max(40),
  destination: z.string().trim().max(320).optional(),
  enabled: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.destination && value.channel === 'email' && !z.string().email().safeParse(value.destination).success) {
    ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Некорректный email для доставки отчёта' });
  }
  if (value.destination && value.channel === 'telegram' && !/^(@[A-Za-z0-9_]{5,32}|-?\d{4,32})$/.test(value.destination)) {
    ctx.addIssue({ code: 'custom', path: ['destination'], message: 'Укажите Telegram chat ID или @channelusername' });
  }
});
const schedulesSchema = z.object({ schedules: z.array(scheduleSchema).max(50) }).strict();

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

async function requireReportsEntitlement(app: Parameters<FastifyPluginAsync>[0], organizationId: string) {
  await assertEntitlement(app, organizationId, 'reports');
}

export const reportsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/reports', {
    preHandler: [app.authenticate, app.authorize('reports.view')],
  }, async (request) => {
    const tenant = actor(request);
    await requireReportsEntitlement(app, tenant.organizationId);
    return listReports(app, tenant.organizationId);
  });

  app.get('/reports/:reportId', {
    preHandler: [app.authenticate, app.authorize('reports.view')],
  }, async (request) => {
    const tenant = actor(request);
    await requireReportsEntitlement(app, tenant.organizationId);
    const { reportId } = reportIdParams.parse(request.params);
    return { report: await getReport(app, tenant.organizationId, reportId) };
  });

  const generateReportHandler = async (request: FastifyRequest, reply: FastifyReply) => {
    const tenant = actor(request);
    await requireReportsEntitlement(app, tenant.organizationId);
    const body = generateSchema.parse(request.body);
    const periodStart = new Date(body.periodStart);
    const periodEnd = new Date(body.periodEnd);
    if (periodStart >= periodEnd) {
      throw new AppError({ code: 'INVALID_REPORT_PERIOD', message: 'Начало периода должно быть раньше конца', statusCode: 400 });
    }
    if (periodEnd.getTime() - periodStart.getTime() > 366 * 86_400_000) {
      throw new AppError({ code: 'REPORT_PERIOD_TOO_LARGE', message: 'Период отчёта не может превышать 366 дней', statusCode: 400 });
    }

    const report = await enqueueReport(app, tenant, {
      type: body.type,
      title: body.title,
      periodStart,
      periodEnd,
    });
    return reply.code(202).send({ report });
  };

  app.post('/reports', {
    preHandler: [app.authenticate, app.authorize('reports.create')],
  }, generateReportHandler);

  app.post('/reports/generate', {
    preHandler: [app.authenticate, app.authorize('reports.create')],
  }, generateReportHandler);

  app.put('/reports/schedules', {
    preHandler: [app.authenticate, app.authorize('reports.create')],
  }, async (request) => {
    const tenant = actor(request);
    await requireReportsEntitlement(app, tenant.organizationId);
    const { schedules } = schedulesSchema.parse(request.body);
    return { schedules: await saveReportSchedules(app, tenant, schedules) };
  });
};
