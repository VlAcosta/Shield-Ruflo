import type { FastifyInstance } from 'fastify';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { aiProviderRegistry } from '../ai/ai-provider.registry.js';
import { AiProviderError } from '../ai/ai-provider.types.js';
import { redactPii } from '../ai/privacy/pii-redaction.js';
import type { AskShieldEvidence } from './ask-shield.schemas.js';

const MAX_REVIEW_EVIDENCE = 12;

type ActorContext = { organizationId: string; userId: string };

async function providerOrThrow() {
  const provider = aiProviderRegistry.active();
  if (!provider) throw new AppError({ code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI provider недоступен', statusCode: 503 });
  const availability = provider.availability();
  if (!availability.available) {
    throw new AppError({ code: availability.reasonCode ?? 'AI_PROVIDER_UNAVAILABLE', message: availability.reasonMessage ?? 'AI provider недоступен', statusCode: 503 });
  }
  if (!provider.answerShieldQuestion) {
    throw new AppError({ code: 'ASK_SHIELD_PROVIDER_UNSUPPORTED', message: 'Активный AI provider не поддерживает Ask Shield', statusCode: 503 });
  }
  return provider;
}

export async function enqueueAskShieldQuestion(app: FastifyInstance, actor: ActorContext, question: string) {
  await providerOrThrow();
  const query = await app.prisma.$transaction(async (tx) => {
    const created = await tx.askShieldQuery.create({
      data: { organizationId: actor.organizationId, createdByUserId: actor.userId, question, status: 'RUNNING' },
    });
    await tx.job.create({
      data: {
        organizationId: actor.organizationId,
        type: 'askShield.answer',
        payload: { organizationId: actor.organizationId, queryId: created.id },
        dedupeKey: `askShield.answer:${created.id}`,
        maxAttempts: 3,
      },
    });
    return created;
  });
  await app.prisma.auditLog.create({
    data: { organizationId: actor.organizationId, actorUserId: actor.userId, action: 'ask_shield.query.queued', entityType: 'AskShieldQuery', entityId: query.id },
  });
  return query;
}

export async function listAskShieldHistory(app: FastifyInstance, organizationId: string, input: { limit: number; cursor?: string }) {
  const rows = await app.prisma.askShieldQuery.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > input.limit;
  const items = hasMore ? rows.slice(0, input.limit) : rows;
  return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
}

export async function getAskShieldQuery(app: FastifyInstance, organizationId: string, queryId: string) {
  const query = await app.prisma.askShieldQuery.findFirst({ where: { id: queryId, organizationId } });
  if (!query) throw new AppError({ code: 'ASK_SHIELD_QUERY_NOT_FOUND', message: 'Ask Shield запрос не найден', statusCode: 404 });
  return query;
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function buildTenantContext(prisma: PrismaClient, organizationId: string) {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [organization, reviewAggregate, negativeReviews, unansweredReviews, recentReviews, openCases, overdueTasks, visibilityRuns, visibilityMentions, listingAggregate, competitorSnapshotCount] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, locale: true, industry: true } }),
    prisma.review.aggregate({ where: { organizationId, receivedAt: { gte: thirtyDaysAgo } }, _count: { _all: true }, _avg: { rating: true } }),
    prisma.review.count({ where: { organizationId, receivedAt: { gte: thirtyDaysAgo }, rating: { lte: 2 } } }),
    prisma.review.count({ where: { organizationId, receivedAt: { gte: thirtyDaysAgo }, replies: { none: { status: 'PUBLISHED' } } } }),
    prisma.review.findMany({
      where: { organizationId, receivedAt: { gte: thirtyDaysAgo } },
      orderBy: [{ receivedAt: 'desc' }, { id: 'desc' }],
      take: MAX_REVIEW_EVIDENCE,
      select: { id: true, rating: true, text: true, receivedAt: true },
    }),
    prisma.reputationCase.count({ where: { organizationId, status: { notIn: ['RESOLVED', 'VERIFIED', 'CLOSED'] } } }),
    prisma.task.count({ where: { organizationId, deadline: { lt: now }, status: { notIn: ['DONE', 'ARCHIVED'] } } }),
    prisma.aiVisibilityRun.count({ where: { organizationId, status: 'SUCCEEDED', completedAt: { gte: thirtyDaysAgo } } }),
    prisma.aiVisibilityResult.count({ where: { organizationId, createdAt: { gte: thirtyDaysAgo }, brandMentioned: true } }),
    prisma.listingSnapshot.aggregate({ where: { organizationId, observedAt: { gte: thirtyDaysAgo } }, _count: { _all: true }, _avg: { healthScore: true } }),
    prisma.competitiveMetricSnapshot.count({ where: { organizationId, observedAt: { gte: thirtyDaysAgo } } }),
  ]);
  if (!organization) throw new AiProviderError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Organization not found', retryable: false });

  const evidence: AskShieldEvidence[] = [
    {
      type: 'aggregate',
      id: null,
      label: '30-day reputation summary',
      route: '/reputation',
      summary: `${reviewAggregate._count._all} reviews; avg rating ${reviewAggregate._avg.rating ?? 'n/a'}; ${negativeReviews} negative; ${unansweredReviews} unanswered`,
    },
    { type: 'case', id: null, label: 'Open reputation cases', route: '/cases', summary: `${openCases} open cases` },
    { type: 'task', id: null, label: 'Overdue tasks', route: '/tasks', summary: `${overdueTasks} overdue tasks` },
    { type: 'ai_visibility', id: null, label: 'AI Visibility 30-day sample', route: '/ai-visibility', summary: `${visibilityMentions}/${visibilityRuns} successful runs mention the brand` },
    { type: 'listing_health', id: null, label: 'Listing Health 30-day measurements', route: '/location-health', summary: `${listingAggregate._count._all} snapshots; avg health ${listingAggregate._avg.healthScore ?? 'n/a'}` },
    { type: 'competitive', id: null, label: 'Competitive Intelligence 30-day snapshots', route: '/competitive', summary: `${competitorSnapshotCount} persisted competitor metric snapshots` },
    ...recentReviews.map((review) => ({
      type: 'review' as const,
      id: review.id,
      label: `Review ${review.rating}/5 · ${review.receivedAt.toISOString().slice(0, 10)}`,
      route: `/reviews?reviewId=${encodeURIComponent(review.id)}`,
      summary: redactPii(review.text).text.slice(0, 900) || null,
    })),
  ];

  const context = {
    period: { label: 'last_30_days', from: thirtyDaysAgo.toISOString(), to: now.toISOString() },
    organization: { name: organization.name, industry: organization.industry },
    reputation: {
      reviewCount: reviewAggregate._count._all,
      averageRating: reviewAggregate._avg.rating === null ? null : Number(reviewAggregate._avg.rating.toFixed(2)),
      negativeReviewCount: negativeReviews,
      unansweredReviewCount: unansweredReviews,
      openCaseCount: openCases,
      overdueTaskCount: overdueTasks,
    },
    aiVisibility: { successfulRuns: visibilityRuns, brandMentionRuns: visibilityMentions },
    listingHealth: {
      snapshotCount: listingAggregate._count._all,
      averageHealthScore: listingAggregate._avg.healthScore === null ? null : Number(listingAggregate._avg.healthScore.toFixed(1)),
    },
    competitive: { persistedSnapshotCount: competitorSnapshotCount },
  };
  return { organization, context, evidence };
}

export async function processAskShieldJob(prisma: PrismaClient, input: { organizationId: string; queryId: string }) {
  const query = await prisma.askShieldQuery.findFirst({ where: { id: input.queryId, organizationId: input.organizationId } });
  if (!query) throw new AiProviderError({ code: 'ASK_SHIELD_QUERY_NOT_FOUND', message: 'Ask Shield query not found', retryable: false });
  if (query.status === 'SUCCEEDED') return query;
  const provider = aiProviderRegistry.active();
  if (!provider || !provider.answerShieldQuestion) {
    await prisma.askShieldQuery.update({ where: { id: query.id }, data: { status: 'FAILED', errorCode: 'ASK_SHIELD_PROVIDER_UNSUPPORTED', errorMessage: 'AI provider unavailable or unsupported', completedAt: new Date() } });
    throw new AiProviderError({ code: 'ASK_SHIELD_PROVIDER_UNSUPPORTED', message: 'AI provider unavailable or unsupported', retryable: false });
  }
  const availability = provider.availability();
  if (!availability.available) {
    const code = availability.reasonCode ?? 'AI_PROVIDER_UNAVAILABLE';
    await prisma.askShieldQuery.update({ where: { id: query.id }, data: { status: 'FAILED', errorCode: code, errorMessage: availability.reasonMessage ?? 'AI provider unavailable', completedAt: new Date() } });
    throw new AiProviderError({ code, message: availability.reasonMessage ?? 'AI provider unavailable', retryable: false });
  }
  try {
    const { organization, context, evidence } = await buildTenantContext(prisma, input.organizationId);
    const response = await provider.answerShieldQuestion({
      organizationId: input.organizationId,
      question: query.question,
      locale: organization.locale,
      organizationName: organization.name,
      context,
      evidence,
    });
    const selectedEvidence = [...new Set(response.output.evidenceIndexes)]
      .filter((index) => index >= 0 && index < evidence.length)
      .map((index) => evidence[index])
      .filter((item): item is AskShieldEvidence => Boolean(item));
    return await prisma.askShieldQuery.update({
      where: { id: query.id },
      data: {
        status: 'SUCCEEDED',
        answer: response.output.answer,
        evidence: asJson(selectedEvidence),
        provider: response.provider,
        model: response.model,
        promptVersion: response.promptVersion,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        estimatedCostMicros: response.estimatedCostMicros === null ? null : BigInt(response.estimatedCostMicros),
        errorCode: null,
        errorMessage: null,
        completedAt: new Date(),
      },
    });
  } catch (error) {
    const code = error instanceof AiProviderError ? error.code : 'ASK_SHIELD_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    await prisma.askShieldQuery.update({ where: { id: query.id }, data: { status: 'FAILED', errorCode: code, errorMessage: message.slice(0, 4000), completedAt: new Date() } });
    throw error;
  }
}
