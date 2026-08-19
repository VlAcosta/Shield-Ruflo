import type { FastifyInstance } from 'fastify';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';

const REPORT_SCHEDULE_KEY_PREFIX = 'reports:schedules:';
const MAX_REPORTS = 100;

type ReportActor = {
  organizationId: string;
  userId: string;
};

type GenerateReportInput = {
  type: string;
  title: string;
  periodStart: Date;
  periodEnd: Date;
};

export type ReportScheduleInput = {
  id: string;
  title: string;
  day: 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
  dayLabel: string;
  time: string;
  channel: 'email' | 'telegram';
  channelLabel: string;
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
        payload: { reportId: created.id },
        dedupeKey: `report.generate:${created.id}`,
        maxAttempts: 3,
      },
    });

    const auditMetadata = asJson({
      type: created.type,
      periodStart: created.periodStart.toISOString(),
      periodEnd: created.periodEnd.toISOString(),
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
        metadata: asJson({ count: schedules.length, enabled: schedules.filter((item) => item.enabled).length }),
      },
    });
  });

  return schedules;
}
