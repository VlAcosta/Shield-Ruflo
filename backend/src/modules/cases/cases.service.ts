import type { FastifyInstance } from 'fastify';
import type {
  Prisma,
  PrismaClient,
  ReputationCaseMetricPhase,
  ReputationCaseSeverity,
  ReputationCaseStatus,
  ReviewSentiment,
} from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { createTask } from '../tasks/tasks.service.js';
import type { CreateCaseInput, UpdateCaseInput } from './cases.schemas.js';

const DEFAULT_METRIC_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type DbClient = PrismaClient | Prisma.TransactionClient;

type MetricPayload = {
  reviewCount: number;
  similarComplaintCount: number;
  averageRating: number | null;
  topicSentimentScore: number | null;
  averageResponseMinutes: number | null;
  responseCoverage: number;
};

const caseInclude = {
  owner: {
    select: {
      id: true,
      userId: true,
      user: { select: { firstName: true, lastName: true, displayName: true, email: true, phone: true } },
    },
  },
  createdBy: { select: { id: true, firstName: true, lastName: true, displayName: true, email: true } },
  reviews: {
    orderBy: { addedAt: 'asc' as const },
    include: {
      review: {
        select: {
          id: true,
          rating: true,
          text: true,
          receivedAt: true,
          repliedAt: true,
          locationId: true,
          source: { select: { provider: true, name: true } },
        },
      },
    },
  },
  locations: {
    orderBy: { addedAt: 'asc' as const },
    include: { location: { select: { id: true, name: true, city: true, region: true } } },
  },
  tasks: {
    where: { archivedAt: null },
    orderBy: { createdAt: 'desc' as const },
    select: { id: true, title: true, status: true, priority: true, deadline: true, reviewId: true },
  },
  activities: {
    orderBy: { createdAt: 'desc' as const },
    take: 100,
    select: { id: true, action: true, fromStatus: true, toStatus: true, metadata: true, actorUserId: true, createdAt: true },
  },
  metricSnapshots: {
    orderBy: { measuredAt: 'desc' as const },
    take: 20,
  },
} satisfies Prisma.ReputationCaseInclude;

const allowedTransitions: Readonly<Record<ReputationCaseStatus, readonly ReputationCaseStatus[]>> = Object.freeze({
  NEW: ['TRIAGED'],
  TRIAGED: ['ASSIGNED', 'IN_PROGRESS'],
  ASSIGNED: ['TRIAGED', 'IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_CUSTOMER', 'WAITING_INTERNAL', 'RESOLVED'],
  WAITING_CUSTOMER: ['IN_PROGRESS', 'RESOLVED'],
  WAITING_INTERNAL: ['IN_PROGRESS', 'RESOLVED'],
  RESOLVED: ['VERIFIED', 'IN_PROGRESS'],
  VERIFIED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'],
});

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeCategory(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, '-').slice(0, 120);
}

function sentimentScore(value: ReviewSentiment): number {
  if (value === 'POSITIVE') return 1;
  if (value === 'NEUTRAL') return 0;
  if (value === 'MIXED') return -0.5;
  return -1;
}

function defaultSlaMinutes(severity: ReputationCaseSeverity): number {
  if (severity === 'CRITICAL') return 120;
  if (severity === 'HIGH') return 240;
  if (severity === 'MEDIUM') return 1440;
  return 2880;
}

function displayPerson(user: { displayName?: string | null; firstName?: string | null; lastName?: string | null; email?: string | null; phone?: string | null } | null | undefined) {
  if (!user) return null;
  return user.displayName
    || [user.firstName, user.lastName].filter(Boolean).join(' ')
    || user.email
    || user.phone
    || null;
}

function presentCase(row: any) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    severity: String(row.severity).toLowerCase(),
    status: String(row.status).toLowerCase(),
    origin: String(row.origin).toLowerCase(),
    ownerMemberId: row.ownerMemberId,
    owner: row.owner ? { memberId: row.owner.id, userId: row.owner.userId, name: displayPerson(row.owner.user) } : null,
    slaMinutes: row.slaMinutes,
    dueAt: row.dueAt?.toISOString?.() ?? null,
    rootCause: row.rootCause ?? '',
    resolution: row.resolution ?? '',
    outcome: row.outcome ?? null,
    reopenedAt: row.reopenedAt?.toISOString?.() ?? null,
    resolvedAt: row.resolvedAt?.toISOString?.() ?? null,
    verifiedAt: row.verifiedAt?.toISOString?.() ?? null,
    closedAt: row.closedAt?.toISOString?.() ?? null,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
    createdBy: row.createdBy ? { id: row.createdBy.id, name: displayPerson(row.createdBy) } : null,
    reviews: (row.reviews ?? []).map((link: any) => ({
      id: link.review.id,
      rating: link.review.rating,
      text: link.review.text,
      receivedAt: link.review.receivedAt?.toISOString?.() ?? link.review.receivedAt,
      repliedAt: link.review.repliedAt?.toISOString?.() ?? null,
      locationId: link.review.locationId,
      provider: link.review.source?.provider ?? null,
      sourceName: link.review.source?.name ?? null,
    })),
    locations: (row.locations ?? []).map((link: any) => ({
      id: link.location.id,
      name: link.location.name,
      city: link.location.city,
      region: link.location.region,
    })),
    tasks: (row.tasks ?? []).map((task: any) => ({
      ...task,
      status: String(task.status).toLowerCase(),
      priority: String(task.priority).toLowerCase(),
      deadline: task.deadline?.toISOString?.() ?? null,
    })),
    activities: row.activities ?? [],
    metricSnapshots: (row.metricSnapshots ?? []).map((snapshot: any) => ({
      ...snapshot,
      phase: String(snapshot.phase).toLowerCase(),
      periodStart: snapshot.periodStart?.toISOString?.() ?? snapshot.periodStart,
      periodEnd: snapshot.periodEnd?.toISOString?.() ?? snapshot.periodEnd,
      measuredAt: snapshot.measuredAt?.toISOString?.() ?? snapshot.measuredAt,
    })),
  };
}

async function assertOwnerMember(db: DbClient, organizationId: string, memberId: string | null | undefined) {
  if (!memberId) return;
  const member = await db.organizationMember.findFirst({
    where: { id: memberId, organizationId, status: 'ACTIVE' },
    select: { id: true },
  });
  if (!member) throw new AppError({ code: 'CASE_OWNER_NOT_FOUND', message: 'Ответственный участник команды не найден', statusCode: 404 });
}

async function scopedReviews(db: DbClient, organizationId: string, reviewIds: string[]) {
  if (!reviewIds.length) return [];
  const rows = await db.review.findMany({
    where: { organizationId, id: { in: reviewIds } },
    select: {
      id: true,
      rating: true,
      locationId: true,
      insights: {
        orderBy: { analysisVersion: 'desc' },
        take: 1,
        select: {
          reputationRisk: true,
          legalPrRisk: true,
          safetyRisk: true,
          rootCauseHypothesis: true,
          aspects: { orderBy: { confidence: 'desc' }, select: { aspect: true, sentiment: true, confidence: true } },
        },
      },
    },
  });
  if (rows.length !== reviewIds.length) {
    throw new AppError({ code: 'CASE_REVIEW_NOT_FOUND', message: 'Один или несколько отзывов не найдены в текущей организации', statusCode: 404 });
  }
  return rows;
}

async function scopedLocations(db: DbClient, organizationId: string, locationIds: string[]) {
  if (!locationIds.length) return [];
  const rows = await db.location.findMany({
    where: { id: { in: locationIds }, business: { organizationId } },
    select: { id: true },
  });
  if (rows.length !== locationIds.length) {
    throw new AppError({ code: 'CASE_LOCATION_NOT_FOUND', message: 'Одна или несколько локаций не найдены в текущей организации', statusCode: 404 });
  }
  return rows;
}

function inferCategory(reviews: Awaited<ReturnType<typeof scopedReviews>>, requested?: string): string {
  if (requested?.trim()) return normalizeCategory(requested);
  for (const review of reviews) {
    const insight = review.insights[0];
    const negativeAspect = insight?.aspects.find((item) => item.sentiment === 'NEGATIVE' || item.sentiment === 'MIXED');
    if (negativeAspect?.aspect) return normalizeCategory(negativeAspect.aspect);
  }
  return 'general';
}

function inferSeverity(reviews: Awaited<ReturnType<typeof scopedReviews>>, requested?: ReputationCaseSeverity): ReputationCaseSeverity {
  if (requested) return requested;
  let score = 0;
  for (const review of reviews) {
    const insight = review.insights[0];
    score = Math.max(score, insight?.reputationRisk ?? 0);
    if (review.rating <= 1 || insight?.legalPrRisk || insight?.safetyRisk) return 'CRITICAL';
    if (review.rating <= 2) score = Math.max(score, 60);
  }
  if (score >= 80) return 'CRITICAL';
  if (score >= 60) return 'HIGH';
  if (score >= 30) return 'MEDIUM';
  return reviews.length ? 'MEDIUM' : 'LOW';
}

async function calculateMetrics(
  db: DbClient,
  organizationId: string,
  locationIds: string[],
  category: string,
  periodStart: Date,
  periodEnd: Date,
): Promise<MetricPayload> {
  const reviews = await db.review.findMany({
    where: {
      organizationId,
      status: { not: 'ARCHIVED' },
      receivedAt: { gte: periodStart, lte: periodEnd },
      ...(locationIds.length ? { locationId: { in: locationIds } } : {}),
    },
    select: {
      rating: true,
      receivedAt: true,
      repliedAt: true,
      insights: {
        orderBy: { analysisVersion: 'desc' },
        take: 1,
        select: {
          sentiment: true,
          aspects: { select: { aspect: true, sentiment: true } },
        },
      },
    },
  });

  const normalizedCategory = normalizeCategory(category);
  const topicScores: number[] = [];
  let similarComplaintCount = 0;
  let responseMinutes = 0;
  let responseCount = 0;
  let ratingSum = 0;

  for (const review of reviews) {
    ratingSum += review.rating;
    if (review.repliedAt) {
      responseMinutes += Math.max(0, review.repliedAt.getTime() - review.receivedAt.getTime()) / 60_000;
      responseCount += 1;
    }
    const insight = review.insights[0];
    const matching = insight?.aspects.filter((aspect) => normalizeCategory(aspect.aspect) === normalizedCategory) ?? [];
    for (const aspect of matching) topicScores.push(sentimentScore(aspect.sentiment));
    if (review.rating <= 3 && matching.some((aspect) => aspect.sentiment === 'NEGATIVE' || aspect.sentiment === 'MIXED')) {
      similarComplaintCount += 1;
    }
  }

  return {
    reviewCount: reviews.length,
    similarComplaintCount,
    averageRating: reviews.length ? Number((ratingSum / reviews.length).toFixed(2)) : null,
    topicSentimentScore: topicScores.length ? Number((topicScores.reduce((sum, value) => sum + value, 0) / topicScores.length).toFixed(3)) : null,
    averageResponseMinutes: responseCount ? Number((responseMinutes / responseCount).toFixed(1)) : null,
    responseCoverage: reviews.length ? Number((responseCount / reviews.length).toFixed(3)) : 0,
  };
}

async function createMetricSnapshot(
  db: DbClient,
  input: { organizationId: string; caseId: string; locationIds: string[]; category: string; phase: ReputationCaseMetricPhase; periodEnd?: Date },
) {
  const periodEnd = input.periodEnd ?? new Date();
  const periodStart = new Date(periodEnd.getTime() - DEFAULT_METRIC_WINDOW_DAYS * DAY_MS);
  const metrics = await calculateMetrics(db, input.organizationId, input.locationIds, input.category, periodStart, periodEnd);
  return db.reputationCaseMetricSnapshot.create({
    data: {
      organizationId: input.organizationId,
      caseId: input.caseId,
      phase: input.phase,
      periodStart,
      periodEnd,
      metrics: toJson(metrics),
    },
  });
}

function numericMetric(value: unknown, key: keyof MetricPayload): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const metric = (value as Record<string, unknown>)[key];
  return typeof metric === 'number' && Number.isFinite(metric) ? metric : null;
}

function buildOutcome(caseRow: { createdAt: Date; resolvedAt: Date | null; slaMinutes: number | null }, baseline: unknown, current: unknown) {
  const baselineSimilar = numericMetric(baseline, 'similarComplaintCount');
  const currentSimilar = numericMetric(current, 'similarComplaintCount');
  const baselineRating = numericMetric(baseline, 'averageRating');
  const currentRating = numericMetric(current, 'averageRating');
  const baselineSentiment = numericMetric(baseline, 'topicSentimentScore');
  const currentSentiment = numericMetric(current, 'topicSentimentScore');
  const baselineResponse = numericMetric(baseline, 'averageResponseMinutes');
  const currentResponse = numericMetric(current, 'averageResponseMinutes');
  const resolutionMinutes = caseRow.resolvedAt
    ? Math.round((caseRow.resolvedAt.getTime() - caseRow.createdAt.getTime()) / 60_000)
    : null;
  return {
    baseline,
    current,
    delta: {
      repeatedComplaints: baselineSimilar !== null && currentSimilar !== null ? currentSimilar - baselineSimilar : null,
      averageRating: baselineRating !== null && currentRating !== null ? Number((currentRating - baselineRating).toFixed(2)) : null,
      topicSentimentScore: baselineSentiment !== null && currentSentiment !== null ? Number((currentSentiment - baselineSentiment).toFixed(3)) : null,
      averageResponseMinutes: baselineResponse !== null && currentResponse !== null ? Number((currentResponse - baselineResponse).toFixed(1)) : null,
    },
    resolutionMinutes,
    resolutionSlaMet: resolutionMinutes !== null && caseRow.slaMinutes !== null ? resolutionMinutes <= caseRow.slaMinutes : null,
    measuredAt: new Date().toISOString(),
  };
}

async function getCaseRow(app: FastifyInstance, organizationId: string, caseId: string) {
  const row = await app.prisma.reputationCase.findFirst({ where: { id: caseId, organizationId }, include: caseInclude });
  if (!row) throw new AppError({ code: 'REPUTATION_CASE_NOT_FOUND', message: 'Репутационный кейс не найден', statusCode: 404 });
  return row;
}

export async function listCases(app: FastifyInstance, organizationId: string, query: {
  status?: ReputationCaseStatus;
  severity?: ReputationCaseSeverity;
  ownerMemberId?: string;
  locationId?: string;
  category?: string;
  overdue?: boolean;
  limit: number;
  cursor?: string;
}) {
  const now = new Date();
  const rows = await app.prisma.reputationCase.findMany({
    where: {
      organizationId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.ownerMemberId ? { ownerMemberId: query.ownerMemberId } : {}),
      ...(query.category ? { category: normalizeCategory(query.category) } : {}),
      ...(query.locationId ? { locations: { some: { locationId: query.locationId } } } : {}),
      ...(query.overdue ? { dueAt: { lt: now }, status: { notIn: ['RESOLVED', 'VERIFIED', 'CLOSED'] } } : {}),
    },
    include: caseInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return { items: page.map(presentCase), nextCursor: hasMore ? page.at(-1)?.id ?? null : null };
}

export async function getCase(app: FastifyInstance, organizationId: string, caseId: string) {
  return presentCase(await getCaseRow(app, organizationId, caseId));
}

export async function createReputationCase(
  app: FastifyInstance,
  context: { organizationId: string; userId: string | null },
  input: CreateCaseInput,
) {
  if (input.sourceDedupeKey) {
    const existing = await app.prisma.reputationCase.findFirst({
      where: { organizationId: context.organizationId, sourceDedupeKey: input.sourceDedupeKey },
      include: caseInclude,
    });
    if (existing) return { case: presentCase(existing), deduplicated: true };
  }

  const reviewIds = [...new Set(input.reviewIds)];
  const requestedLocationIds = [...new Set(input.locationIds)];
  const reviews = await scopedReviews(app.prisma, context.organizationId, reviewIds);
  await scopedLocations(app.prisma, context.organizationId, requestedLocationIds);
  await assertOwnerMember(app.prisma, context.organizationId, input.ownerMemberId);

  const category = inferCategory(reviews, input.category);
  const severity = inferSeverity(reviews, input.severity);
  const slaMinutes = input.slaMinutes ?? defaultSlaMinutes(severity);
  const locationIds = [...new Set([
    ...requestedLocationIds,
    ...reviews.map((review) => review.locationId).filter((value): value is string => Boolean(value)),
  ])];
  const createdAt = new Date();
  const dueAt = input.dueAt ? new Date(input.dueAt) : new Date(createdAt.getTime() + slaMinutes * 60_000);
  const title = input.title?.trim() || `${severity === 'CRITICAL' ? 'Критический' : severity === 'HIGH' ? 'Высокий риск' : 'Репутационный кейс'} · ${category}`;

  try {
    const created = await app.prisma.$transaction(async (tx) => {
      const row = await tx.reputationCase.create({
        data: {
          organizationId: context.organizationId,
          title,
          category,
          severity,
          origin: input.origin,
          ownerMemberId: input.ownerMemberId ?? null,
          slaMinutes,
          dueAt,
          rootCause: input.rootCause ?? reviews.find((review) => review.insights[0]?.rootCauseHypothesis)?.insights[0]?.rootCauseHypothesis ?? null,
          resolution: input.resolution ?? null,
          sourceDedupeKey: input.sourceDedupeKey ?? null,
          createdByUserId: context.userId,
          reviews: reviewIds.length ? { createMany: { data: reviewIds.map((reviewId) => ({ reviewId })), skipDuplicates: true } } : undefined,
          locations: locationIds.length ? { createMany: { data: locationIds.map((locationId) => ({ locationId })), skipDuplicates: true } } : undefined,
        },
      });
      await tx.reputationCaseActivity.create({
        data: {
          organizationId: context.organizationId,
          caseId: row.id,
          actorUserId: context.userId,
          action: 'case.created',
          toStatus: 'NEW',
          metadata: toJson({ origin: input.origin, severity, category, reviewIds, locationIds }),
        },
      });
      await createMetricSnapshot(tx, {
        organizationId: context.organizationId,
        caseId: row.id,
        locationIds,
        category,
        phase: 'BASELINE',
        periodEnd: createdAt,
      });
      await tx.auditLog.create({
        data: {
          organizationId: context.organizationId,
          actorUserId: context.userId,
          action: 'reputation_case.created',
          entityType: 'ReputationCase',
          entityId: row.id,
          metadata: toJson({ origin: input.origin, severity, category, reviewIds, locationIds }),
        },
      });
      if (severity === 'CRITICAL' || severity === 'HIGH') {
        await tx.notification.create({
          data: {
            organizationId: context.organizationId,
            userId: null,
            type: 'reputation_case',
            title: severity === 'CRITICAL' ? 'Критический репутационный кейс' : 'Репутационный кейс высокого риска',
            body: `${title}. SLA: ${slaMinutes} мин.`,
            payload: { caseId: row.id, severity, category },
          },
        });
      }
      return row;
    });
    return { case: presentCase(await getCaseRow(app, context.organizationId, created.id)), deduplicated: false };
  } catch (error) {
    if (input.sourceDedupeKey && error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const existing = await app.prisma.reputationCase.findFirst({
        where: { organizationId: context.organizationId, sourceDedupeKey: input.sourceDedupeKey },
        include: caseInclude,
      });
      if (existing) return { case: presentCase(existing), deduplicated: true };
    }
    throw error;
  }
}

export async function createCaseFromReview(
  app: FastifyInstance,
  context: { organizationId: string; userId: string | null },
  reviewId: string,
  input: Omit<CreateCaseInput, 'reviewIds' | 'origin'> & { origin?: 'REVIEW' | 'AUTOMATION' },
) {
  return createReputationCase(app, context, {
    ...input,
    origin: input.origin ?? 'REVIEW',
    reviewIds: [reviewId],
  });
}

export async function updateReputationCase(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  caseId: string,
  patch: UpdateCaseInput,
) {
  const existing = await app.prisma.reputationCase.findFirst({ where: { id: caseId, organizationId: context.organizationId } });
  if (!existing) throw new AppError({ code: 'REPUTATION_CASE_NOT_FOUND', message: 'Репутационный кейс не найден', statusCode: 404 });
  await assertOwnerMember(app.prisma, context.organizationId, patch.ownerMemberId);
  const category = patch.category !== undefined ? normalizeCategory(patch.category) : undefined;
  const updated = await app.prisma.$transaction(async (tx) => {
    const row = await tx.reputationCase.update({
      where: { id: existing.id },
      data: {
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(patch.severity !== undefined ? { severity: patch.severity } : {}),
        ...(patch.ownerMemberId !== undefined ? { ownerMemberId: patch.ownerMemberId } : {}),
        ...(patch.slaMinutes !== undefined ? { slaMinutes: patch.slaMinutes } : {}),
        ...(patch.dueAt !== undefined ? { dueAt: patch.dueAt ? new Date(patch.dueAt) : null } : {}),
        ...(patch.rootCause !== undefined ? { rootCause: patch.rootCause } : {}),
        ...(patch.resolution !== undefined ? { resolution: patch.resolution } : {}),
      },
    });
    await tx.reputationCaseActivity.create({
      data: {
        organizationId: context.organizationId,
        caseId: existing.id,
        actorUserId: context.userId,
        action: 'case.updated',
        metadata: toJson(patch),
      },
    });
    await tx.auditLog.create({
      data: { organizationId: context.organizationId, actorUserId: context.userId, action: 'reputation_case.updated', entityType: 'ReputationCase', entityId: existing.id, metadata: toJson(patch) },
    });
    return row;
  });
  return presentCase(await getCaseRow(app, context.organizationId, updated.id));
}

async function transition(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  caseId: string,
  target: ReputationCaseStatus,
  input: { note?: string; resolution?: string },
) {
  const existing = await app.prisma.reputationCase.findFirst({
    where: { id: caseId, organizationId: context.organizationId },
    include: { locations: { select: { locationId: true } }, metricSnapshots: { orderBy: { measuredAt: 'asc' } } },
  });
  if (!existing) throw new AppError({ code: 'REPUTATION_CASE_NOT_FOUND', message: 'Репутационный кейс не найден', statusCode: 404 });
  if (!allowedTransitions[existing.status].includes(target)) {
    throw new AppError({ code: 'REPUTATION_CASE_INVALID_TRANSITION', message: `Переход ${existing.status} → ${target} запрещён`, statusCode: 409 });
  }
  if (target === 'ASSIGNED' && !existing.ownerMemberId) {
    throw new AppError({ code: 'REPUTATION_CASE_OWNER_REQUIRED', message: 'Перед назначением кейса укажите ответственного', statusCode: 422 });
  }
  const resolution = input.resolution?.trim() || existing.resolution;
  if (target === 'RESOLVED' && !resolution) {
    throw new AppError({ code: 'REPUTATION_CASE_RESOLUTION_REQUIRED', message: 'Перед завершением кейса зафиксируйте решение', statusCode: 422 });
  }

  const now = new Date();
  await app.prisma.$transaction(async (tx) => {
    await tx.reputationCase.update({
      where: { id: existing.id },
      data: {
        status: target,
        ...(target === 'RESOLVED' ? { resolution, resolvedAt: now } : {}),
        ...(target === 'IN_PROGRESS' && ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(existing.status)
          ? { reopenedAt: now, resolvedAt: null, verifiedAt: null, closedAt: null, outcome: Prisma.DbNull }
          : {}),
      },
    });
    await tx.reputationCaseActivity.create({
      data: {
        organizationId: context.organizationId,
        caseId: existing.id,
        actorUserId: context.userId,
        action: target === 'IN_PROGRESS' && ['RESOLVED', 'VERIFIED', 'CLOSED'].includes(existing.status) ? 'case.reopened' : 'case.transitioned',
        fromStatus: existing.status,
        toStatus: target,
        metadata: input.note ? { note: input.note } : undefined,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: 'reputation_case.transitioned',
        entityType: 'ReputationCase',
        entityId: existing.id,
        metadata: { from: existing.status, to: target, note: input.note ?? null },
      },
    });
    if (target === 'RESOLVED') {
      await createMetricSnapshot(tx, {
        organizationId: context.organizationId,
        caseId: existing.id,
        locationIds: existing.locations.map((item) => item.locationId),
        category: existing.category,
        phase: 'RESOLUTION',
        periodEnd: now,
      });
    }
  });
  return getCase(app, context.organizationId, existing.id);
}

export async function transitionReputationCase(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  caseId: string,
  target: ReputationCaseStatus,
  input: { note?: string; resolution?: string } = {},
) {
  return transition(app, context, caseId, target, input);
}

export async function verifyReputationCase(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  caseId: string,
  note?: string,
) {
  const existing = await app.prisma.reputationCase.findFirst({
    where: { id: caseId, organizationId: context.organizationId },
    include: { locations: { select: { locationId: true } }, metricSnapshots: { orderBy: { measuredAt: 'asc' } } },
  });
  if (!existing) throw new AppError({ code: 'REPUTATION_CASE_NOT_FOUND', message: 'Репутационный кейс не найден', statusCode: 404 });
  if (existing.status !== 'RESOLVED') {
    throw new AppError({ code: 'REPUTATION_CASE_INVALID_TRANSITION', message: 'Проверить можно только решённый кейс', statusCode: 409 });
  }
  const now = new Date();
  await app.prisma.$transaction(async (tx) => {
    const snapshot = await createMetricSnapshot(tx, {
      organizationId: context.organizationId,
      caseId: existing.id,
      locationIds: existing.locations.map((item) => item.locationId),
      category: existing.category,
      phase: 'VERIFICATION',
      periodEnd: now,
    });
    const baseline = existing.metricSnapshots.find((item) => item.phase === 'BASELINE');
    const outcome = buildOutcome(existing, baseline?.metrics ?? null, snapshot.metrics);
    await tx.reputationCase.update({ where: { id: existing.id }, data: { status: 'VERIFIED', verifiedAt: now, outcome: toJson(outcome) } });
    await tx.reputationCaseActivity.create({
      data: { organizationId: context.organizationId, caseId: existing.id, actorUserId: context.userId, action: 'case.verified', fromStatus: 'RESOLVED', toStatus: 'VERIFIED', metadata: note ? { note } : undefined },
    });
    await tx.auditLog.create({
      data: { organizationId: context.organizationId, actorUserId: context.userId, action: 'reputation_case.verified', entityType: 'ReputationCase', entityId: existing.id, metadata: { note: note ?? null } },
    });
  });
  return getCase(app, context.organizationId, existing.id);
}

export async function closeReputationCase(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  caseId: string,
  note?: string,
) {
  const existing = await app.prisma.reputationCase.findFirst({ where: { id: caseId, organizationId: context.organizationId } });
  if (!existing) throw new AppError({ code: 'REPUTATION_CASE_NOT_FOUND', message: 'Репутационный кейс не найден', statusCode: 404 });
  if (existing.status !== 'VERIFIED') {
    throw new AppError({ code: 'REPUTATION_CASE_INVALID_TRANSITION', message: 'Закрыть можно только проверенный кейс', statusCode: 409 });
  }
  const now = new Date();
  await app.prisma.$transaction([
    app.prisma.reputationCase.update({ where: { id: existing.id }, data: { status: 'CLOSED', closedAt: now } }),
    app.prisma.reputationCaseActivity.create({ data: { organizationId: context.organizationId, caseId: existing.id, actorUserId: context.userId, action: 'case.closed', fromStatus: 'VERIFIED', toStatus: 'CLOSED', metadata: note ? { note } : undefined } }),
    app.prisma.auditLog.create({ data: { organizationId: context.organizationId, actorUserId: context.userId, action: 'reputation_case.closed', entityType: 'ReputationCase', entityId: existing.id, metadata: { note: note ?? null } } }),
  ]);
  return getCase(app, context.organizationId, existing.id);
}

export async function addCaseTask(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  caseId: string,
  input: { title: string; description?: string; priority?: string; deadline?: string | null; assigneeMemberIds?: string[] },
) {
  const caseRow = await app.prisma.reputationCase.findFirst({
    where: { id: caseId, organizationId: context.organizationId },
    include: { reviews: { take: 1, select: { reviewId: true } }, locations: { take: 1, select: { locationId: true } } },
  });
  if (!caseRow) throw new AppError({ code: 'REPUTATION_CASE_NOT_FOUND', message: 'Репутационный кейс не найден', statusCode: 404 });
  const task = await createTask(app, context, {
    title: input.title,
    description: input.description,
    priority: input.priority,
    deadline: input.deadline,
    reviewId: caseRow.reviews[0]?.reviewId ?? null,
    locationId: caseRow.locations[0]?.locationId ?? null,
    caseId: caseRow.id,
    assigneeMemberIds: input.assigneeMemberIds,
  });
  await app.prisma.reputationCaseActivity.create({
    data: { organizationId: context.organizationId, caseId: caseRow.id, actorUserId: context.userId, action: 'case.task_created', metadata: { taskId: task.id } },
  });
  return task;
}

export async function getCaseOutcome(app: FastifyInstance, organizationId: string, caseId: string) {
  const row = await getCaseRow(app, organizationId, caseId);
  return { outcome: row.outcome ?? null, snapshots: row.metricSnapshots };
}
