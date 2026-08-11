import crypto from 'node:crypto';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { aiProviderRegistry } from './ai-provider.registry.js';
import { AiProviderError } from './ai-provider.types.js';

const ENTITLEMENT_KEY = 'ai.review_intelligence';
const USAGE_KEY = 'ai.review_intelligence.operations';

function stableHash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function prismaErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  return String((error as { code?: unknown }).code ?? '');
}

export function reviewInputHash(review: {
  id: string;
  rating: number;
  text: string;
  language: string | null;
  publishedAt: Date | null;
  providerUpdatedAt: Date | null;
}): string {
  return stableHash({
    id: review.id,
    rating: review.rating,
    text: review.text,
    language: review.language,
    publishedAt: review.publishedAt?.toISOString() ?? null,
    providerUpdatedAt: review.providerUpdatedAt?.toISOString() ?? null,
  });
}

async function hasEntitlement(prisma: PrismaClient, organizationId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findFirst({
    where: { organizationId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE'] } },
    include: { plan: { include: { entitlements: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return subscription?.plan.entitlements.some((item) => item.key === ENTITLEMENT_KEY && item.value === true) ?? false;
}

async function tenantReview(prisma: PrismaClient, organizationId: string, reviewId: string) {
  return prisma.review.findFirst({
    where: { id: reviewId, organizationId },
    include: {
      source: { select: { provider: true, name: true } },
      business: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
}

function monthWindow(date = new Date()) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
  return { start, end };
}

export async function enqueueReviewAnalysis(
  prisma: PrismaClient,
  input: { organizationId: string; reviewId: string; force?: boolean },
) {
  const provider = aiProviderRegistry.active();
  const availability = provider?.availability();
  if (!provider || !availability?.available) {
    return { queued: false as const, reason: availability?.reasonCode ?? 'AI_PROVIDER_UNAVAILABLE' };
  }
  if (!(await hasEntitlement(prisma, input.organizationId))) {
    return { queued: false as const, reason: 'AI_ENTITLEMENT_DISABLED' };
  }

  const review = await tenantReview(prisma, input.organizationId, input.reviewId);
  if (!review) return { queued: false as const, reason: 'REVIEW_NOT_FOUND' };
  const inputHash = reviewInputHash(review);

  if (!input.force) {
    const existingInsight = await prisma.reviewInsight.findFirst({
      where: {
        organizationId: input.organizationId,
        reviewId: input.reviewId,
        inputHash,
        promptVersion: provider.promptVersion,
        provider: provider.id,
        model: provider.model,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (existingInsight) return { queued: false as const, reason: 'ALREADY_ANALYZED', insightId: existingInsight.id };

    const pending = await prisma.aiOperation.findFirst({
      where: {
        organizationId: input.organizationId,
        reviewId: input.reviewId,
        inputHash,
        promptVersion: provider.promptVersion,
        provider: provider.id,
        model: provider.model,
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (pending) return { queued: false as const, reason: 'ALREADY_QUEUED', operationId: pending.id };
  }

  const stableDedupeKey = `ai:review:${input.reviewId}:${inputHash}:${provider.promptVersion}:${provider.model}`;
  try {
    return await prisma.$transaction(async (tx) => {
      const operation = await tx.aiOperation.create({
        data: {
          organizationId: input.organizationId,
          reviewId: input.reviewId,
          operationType: 'REVIEW_INTELLIGENCE',
          provider: provider.id,
          model: provider.model,
          modelVersion: null,
          promptVersion: provider.promptVersion,
          inputHash,
          status: 'QUEUED',
        },
      });
      const dedupeKey = input.force ? `ai:review:${input.reviewId}:${operation.id}` : stableDedupeKey;
      const job = await tx.job.create({
        data: {
          organizationId: input.organizationId,
          type: 'ai.analyzeReview',
          payload: { organizationId: input.organizationId, reviewId: input.reviewId, aiOperationId: operation.id },
          dedupeKey,
          maxAttempts: 5,
        },
      });
      return { queued: true as const, operationId: operation.id, jobId: job.id };
    });
  } catch (error) {
    if (!input.force && prismaErrorCode(error) === 'P2002') {
      const pending = await prisma.aiOperation.findFirst({
        where: {
          organizationId: input.organizationId,
          reviewId: input.reviewId,
          inputHash,
          promptVersion: provider.promptVersion,
          provider: provider.id,
          model: provider.model,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      return pending
        ? { queued: false as const, reason: 'ALREADY_QUEUED', operationId: pending.id }
        : { queued: false as const, reason: 'ALREADY_QUEUED' };
    }
    throw error;
  }
}

export async function processReviewAnalysisJob(
  prisma: PrismaClient,
  payload: { organizationId: string; reviewId: string; aiOperationId: string },
) {
  const operation = await prisma.aiOperation.findFirst({
    where: { id: payload.aiOperationId, organizationId: payload.organizationId, reviewId: payload.reviewId },
  });
  if (!operation) throw new AiProviderError({ code: 'AI_OPERATION_NOT_FOUND', message: 'AI operation not found', retryable: false });
  if (operation.status === 'SUCCEEDED' || operation.status === 'SKIPPED') return;

  const review = await tenantReview(prisma, payload.organizationId, payload.reviewId);
  if (!review) throw new AiProviderError({ code: 'REVIEW_NOT_FOUND', message: 'Review not found', retryable: false });

  const currentHash = reviewInputHash(review);
  if (currentHash !== operation.inputHash) {
    await prisma.aiOperation.update({
      where: { id: operation.id },
      data: { status: 'SKIPPED', completedAt: new Date(), errorCode: 'AI_INPUT_STALE', errorMessage: 'Review changed before analysis started' },
    });
    await enqueueReviewAnalysis(prisma, { organizationId: payload.organizationId, reviewId: payload.reviewId });
    return;
  }

  const provider = aiProviderRegistry.get(operation.provider);
  if (!provider || !provider.availability().available) {
    await prisma.aiOperation.update({
      where: { id: operation.id },
      data: { status: 'FAILED', completedAt: new Date(), errorCode: 'AI_PROVIDER_UNAVAILABLE', errorMessage: 'Configured AI provider is unavailable' },
    });
    throw new AiProviderError({ code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI provider unavailable', retryable: false });
  }

  const startedAt = new Date();
  await prisma.aiOperation.update({
    where: { id: operation.id },
    data: { status: 'RUNNING', startedAt, completedAt: null, errorCode: null, errorMessage: null },
  });

  try {
    const result = await provider.analyzeReview({
      organizationId: payload.organizationId,
      reviewId: payload.reviewId,
      rating: review.rating,
      text: review.text,
      language: review.language,
      provider: review.source.provider,
      businessName: review.business.name,
      locationName: review.location?.name ?? null,
    });
    const completedAt = new Date();
    const outputHash = stableHash(result.output);

    const insight = await prisma.$transaction(async (tx) => {
      // Multiple worker processes may finish forced reanalysis for the same review
      // concurrently. Serialize only version allocation for that review so history
      // keeps a deterministic monotonic analysisVersion without a global lock.
      await tx.$queryRaw<Array<{ acquired: number }>>`
        SELECT 1::int AS acquired
        FROM (SELECT pg_advisory_xact_lock(hashtext(${payload.reviewId}), 18)) AS advisory_lock
      `;
      const latest = await tx.reviewInsight.findFirst({
        where: { organizationId: payload.organizationId, reviewId: payload.reviewId },
        orderBy: { analysisVersion: 'desc' },
        select: { analysisVersion: true },
      });
      const analysisVersion = (latest?.analysisVersion ?? 0) + 1;

      const created = await tx.reviewInsight.create({
        data: {
          organizationId: payload.organizationId,
          reviewId: payload.reviewId,
          analysisVersion,
          inputHash: operation.inputHash,
          sentiment: result.output.sentiment,
          operationalUrgency: result.output.operationalUrgency,
          reputationRisk: result.output.reputationRisk,
          churnRisk: result.output.churnRisk,
          churnRiskConfidence: result.output.churnRiskConfidence,
          churnRiskInsufficientEvidence: result.output.churnRiskInsufficientEvidence,
          legalPrRisk: result.output.legalPrRisk,
          legalPrRiskReason: result.output.legalPrRiskReason,
          safetyRisk: result.output.safetyRisk,
          safetyRiskReason: result.output.safetyRiskReason,
          spamSignalProbability: result.output.spamSignalProbability,
          coordinatedSignalProbability: result.output.coordinatedSignalProbability,
          signalReasons: json(result.output.signalReasons),
          rootCauseHypothesis: result.output.rootCauseHypothesis,
          observedFacts: json(result.output.observedFacts),
          inferences: json(result.output.inferences),
          recommendations: json(result.output.recommendations),
          confidence: result.output.confidence,
          provider: result.provider,
          model: result.model,
          modelVersion: result.modelVersion,
          promptVersion: result.promptVersion,
          aspects: {
            create: result.output.aspects.map((aspect) => ({
              aspect: aspect.aspect.trim().toUpperCase().replace(/[^A-ZА-Я0-9]+/gi, '_').slice(0, 80),
              sentiment: aspect.sentiment,
              confidence: aspect.confidence,
              evidence: aspect.evidence,
            })),
          },
        },
      });
      await tx.aiOperation.update({
        where: { id: operation.id },
        data: {
          insightId: created.id,
          status: 'SUCCEEDED',
          completedAt,
          latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          outputHash,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          estimatedCostMicros: result.estimatedCostMicros,
          confidence: result.output.confidence,
          ...(result.moderationResult ? { moderationResult: json(result.moderationResult) } : {}),
        },
      });
      const { start, end } = monthWindow(completedAt);
      await tx.usage.upsert({
        where: { organizationId_key_periodStart_periodEnd: { organizationId: payload.organizationId, key: USAGE_KEY, periodStart: start, periodEnd: end } },
        create: { organizationId: payload.organizationId, key: USAGE_KEY, periodStart: start, periodEnd: end, value: 1 },
        update: { value: { increment: 1 } },
      });
      return created;
    });
    return insight;
  } catch (error) {
    const code = error instanceof AiProviderError ? error.code : 'AI_ANALYSIS_FAILED';
    const message = error instanceof Error ? error.message : 'AI analysis failed';
    await prisma.aiOperation.update({
      where: { id: operation.id },
      data: { status: 'FAILED', completedAt: new Date(), errorCode: code, errorMessage: message.slice(0, 2000) },
    });
    throw error;
  }
}

export async function getReviewIntelligenceState(prisma: PrismaClient, organizationId: string, reviewId: string) {
  const review = await tenantReview(prisma, organizationId, reviewId);
  if (!review) return null;
  const provider = aiProviderRegistry.active();
  const availability = provider?.availability() ?? { configured: false, available: false, reasonCode: 'AI_PROVIDER_UNAVAILABLE' };
  const entitlementEnabled = await hasEntitlement(prisma, organizationId);
  const providerState = entitlementEnabled
    ? availability
    : { ...availability, available: false, reasonCode: 'AI_ENTITLEMENT_DISABLED', reasonMessage: 'AI Review Intelligence недоступен на текущем тарифе.' };
  const [insight, operation] = await Promise.all([
    prisma.reviewInsight.findFirst({
      where: { organizationId, reviewId },
      include: { aspects: { orderBy: [{ confidence: 'desc' }, { aspect: 'asc' }] } },
      orderBy: [{ analysisVersion: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.aiOperation.findFirst({
      where: { organizationId, reviewId, operationType: 'REVIEW_INTELLIGENCE' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);
  const inputHash = reviewInputHash(review);
  let status = 'NOT_ANALYZED';
  if (operation?.status === 'QUEUED') status = 'QUEUED';
  else if (operation?.status === 'RUNNING') status = 'ANALYZING';
  else if (insight && insight.inputHash !== inputHash) status = 'STALE';
  else if (insight) status = 'AVAILABLE';
  else if (operation?.status === 'FAILED') status = providerState.available ? 'FAILED' : 'UNAVAILABLE';
  else if (!providerState.available) status = 'UNAVAILABLE';

  return {
    status,
    providerState,
    freshness: insight ? { stale: insight.inputHash !== inputHash, analyzedAt: insight.createdAt } : null,
    insight,
    operation: operation ? {
      id: operation.id,
      status: operation.status,
      errorCode: operation.errorCode,
      createdAt: operation.createdAt,
      completedAt: operation.completedAt,
    } : null,
  };
}
