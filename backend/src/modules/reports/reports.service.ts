import type { FastifyInstance } from 'fastify';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { env } from '../../config/env.js';

const REPORT_SCHEDULE_KEY_PREFIX = 'reports:schedules:';
const MAX_REPORTS = 100;

type ReportActor = {
  organizationId: string;
  userId: string;
};

export const REPORT_BLOCKS = ['rating', 'reviews', 'reputation', 'platforms', 'competitors', 'tasks', 'recommendations'] as const;
export type ReportBlock = typeof REPORT_BLOCKS[number];

const DEFAULT_REPORT_BLOCKS: ReportBlock[] = ['rating', 'reviews', 'reputation', 'platforms', 'tasks'];

type GenerateReportInput = {
  type: string;
  title: string;
  periodStart: Date;
  periodEnd: Date;
  requestedBlocks?: ReportBlock[];
  idempotencyKey?: string | null;
};

export type ReportScheduleInput = {
  id: string;
  title: string;
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  dayLabel: string;
  time: string;
  channel: 'email' | 'telegram';
  channelLabel: string;
  destination?: string;
  enabled: boolean;
};

function schedulesKey(organizationId: string) {
  return `${REPORT_SCHEDULE_KEY_PREFIX}${organizationId}`;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function readSchedules(value: Prisma.JsonValue | null | undefined): ReportScheduleInput[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ReportScheduleInput => Boolean(item && typeof item === 'object')) as ReportScheduleInput[];
}

export function getReportDeliveryCapabilities() {
  const emailAvailable = env.REPORT_EMAIL_PROVIDER === 'resend'
    ? Boolean(env.REPORT_EMAIL_API_KEY && env.REPORT_EMAIL_FROM)
    : env.REPORT_EMAIL_PROVIDER === 'webhook'
      ? Boolean(env.REPORT_EMAIL_WEBHOOK_URL)
      : false;
  return {
    email: {
      available: emailAvailable,
      provider: env.REPORT_EMAIL_PROVIDER,
      reasonCode: emailAvailable ? null : 'REPORT_EMAIL_PROVIDER_NOT_CONFIGURED',
    },
    telegram: {
      available: Boolean(env.REPORT_TELEGRAM_BOT_TOKEN),
      reasonCode: env.REPORT_TELEGRAM_BOT_TOKEN ? null : 'REPORT_TELEGRAM_BOT_NOT_CONFIGURED',
    },
  };
}

export async function listReports(app: FastifyInstance, organizationId: string) {
  const [reports, metadata] = await Promise.all([
    app.prisma.report.findMany({
      where: { organizationId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: MAX_REPORTS,
    }),
    app.prisma.serviceMetadata.findUnique({ where: { key: schedulesKey(organizationId) } }),
  ]);

  return {
    reports,
    schedules: readSchedules(metadata?.value),
    deliveryCapabilities: getReportDeliveryCapabilities(),
  };
}

export async function getReport(app: FastifyInstance, organizationId: string, reportId: string) {
  const report = await app.prisma.report.findFirst({
    where: { id: reportId, organizationId },
  });

  if (!report) {
    throw new AppError({
      code: 'REPORT_NOT_FOUND',
      message: 'Отчёт не найден',
      statusCode: 404,
    });
  }

  return report;
}

export async function enqueueReport(
  app: FastifyInstance,
  actor: ReportActor,
  input: GenerateReportInput,
) {
  const normalizedBlocks = [...new Set(input.requestedBlocks?.length ? input.requestedBlocks : DEFAULT_REPORT_BLOCKS)];
  const requestKey = String(input.idempotencyKey || '').trim().slice(0, 160);
  if (requestKey) {
    const existingJob = await app.prisma.job.findFirst({
      where: {
        organizationId: actor.organizationId,
        dedupeKey: `report.manual:${requestKey}`,
      },
      select: { payload: true },
    });
    const payload = existingJob?.payload && typeof existingJob.payload === 'object' && !Array.isArray(existingJob.payload)
      ? existingJob.payload as Record<string, unknown>
      : {};
    const reportId = typeof payload.reportId === 'string' ? payload.reportId : '';
    if (reportId) {
      const existingReport = await app.prisma.report.findFirst({
        where: { id: reportId, organizationId: actor.organizationId },
      });
      if (existingReport) return existingReport;
    }
  }

  const existing = await app.prisma.report.findFirst({
    where: {
      organizationId: actor.organizationId,
      type: input.type,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: { in: ['QUEUED', 'GENERATING'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) return existing;

  const report = await app.prisma.$transaction(async (tx) => {
    if (requestKey) {
      const lockKey = `report-manual:${actor.organizationId}:${requestKey}`;
      await tx.$queryRaw<Array<{ acquired: number }>>`
        SELECT 1::int AS acquired FROM (SELECT pg_advisory_xact_lock(hashtext(${lockKey}), 0)) AS advisory_lock
      `;
      const duplicateJob = await tx.job.findFirst({
        where: {
          organizationId: actor.organizationId,
          dedupeKey: `report.manual:${requestKey}`,
        },
        select: { payload: true },
      });
      const duplicatePayload = duplicateJob?.payload && typeof duplicateJob.payload === 'object' && !Array.isArray(duplicateJob.payload)
        ? duplicateJob.payload as Record<string, unknown>
        : {};
      const duplicateReportId = typeof duplicatePayload.reportId === 'string' ? duplicatePayload.reportId : '';
      if (duplicateReportId) {
        const duplicateReport = await tx.report.findFirst({
          where: { id: duplicateReportId, organizationId: actor.organizationId },
        });
        if (duplicateReport) return duplicateReport;
      }
    }

    const created = await tx.report.create({
      data: {
        organizationId: actor.organizationId,
        type: input.type,
        title: input.title,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: 'QUEUED',
      },
    });

    await tx.job.create({
      data: {
        organizationId: actor.organizationId,
        type: 'report.generate',
        payload: { reportId: created.id, requestedBlocks: normalizedBlocks },
        dedupeKey: requestKey ? `report.manual:${requestKey}` : `report.generate:${created.id}`,
        maxAttempts: 3,
      },
    });

    const auditMetadata = asJson({
      type: created.type,
      periodStart: created.periodStart.toISOString(),
      periodEnd: created.periodEnd.toISOString(),
      requestedBlocks: normalizedBlocks,
      idempotentRequest: Boolean(requestKey),
    });

    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'report.created',
        entityType: 'Report',
        entityId: created.id,
        metadata: auditMetadata,
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'report.generate.queued',
        entityType: 'Report',
        entityId: created.id,
        metadata: auditMetadata,
      },
    });

    return created;
  });

  return report;
}

export async function validateReportSchedules(
  app: FastifyInstance,
  organizationId: string,
  schedules: ReportScheduleInput[],
) {
  const capabilities = getReportDeliveryCapabilities();
  for (const schedule of schedules) {
    if (!schedule.enabled) continue;
    const capability = capabilities[schedule.channel];
    if (!capability.available) {
      throw new AppError({
        code: capability.reasonCode || 'REPORT_DELIVERY_PROVIDER_NOT_CONFIGURED',
        message: schedule.channel === 'email'
          ? 'Email-доставка отчётов пока не настроена'
          : 'Telegram-доставка отчётов пока не настроена',
        statusCode: 409,
      });
    }
    if (schedule.channel === 'email' && !String(schedule.destination || '').trim()) {
      const fallback = await app.prisma.organizationMember.findFirst({
        where: {
          organizationId,
          status: 'ACTIVE',
          role: { in: ['OWNER', 'ADMIN'] },
          user: { status: 'ACTIVE', email: { not: null } },
        },
        select: { user: { select: { email: true } } },
        orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      });
      if (!String(fallback?.user.email || '').trim()) {
        throw new AppError({
          code: 'REPORT_EMAIL_DESTINATION_REQUIRED',
          message: 'Укажите email для доставки отчёта',
          statusCode: 422,
        });
      }
    }
  }
  return schedules;
}

export async function saveReportSchedules(
  app: FastifyInstance,
  actor: ReportActor,
  schedules: ReportScheduleInput[],
) {
  await app.prisma.$transaction(async (tx) => {
    await tx.serviceMetadata.upsert({
      where: { key: schedulesKey(actor.organizationId) },
      create: {
        key: schedulesKey(actor.organizationId),
        value: asJson(schedules),
      },
      update: {
        value: asJson(schedules),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'report.schedules.updated',
        entityType: 'ReportSchedule',
        metadata: asJson({
          count: schedules.length,
          enabled: schedules.filter((item) => item.enabled).length,
          channels: [...new Set(schedules.filter((item) => item.enabled).map((item) => item.channel))],
        }),
      },
    });
  });

  return schedules;
}
