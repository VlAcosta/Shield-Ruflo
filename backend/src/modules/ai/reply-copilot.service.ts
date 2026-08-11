import crypto from 'node:crypto';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { aiProviderRegistry } from './ai-provider.registry.js';
import { AiProviderError } from './ai-provider.types.js';
import {
  AI_REPLY_PROMPT_VERSION,
  brandVoiceSchema,
  replyAutopilotSchema,
  type ReplyGenerationMode,
} from './reply-copilot.schemas.js';
import { evaluateReplyPolicy } from './reply-policy.service.js';
import { enqueueReplyPublication } from '../reviews/review-publishing.service.js';

const REPLY_ENTITLEMENT = 'ai.reply_copilot';
const AUTOPILOT_ENTITLEMENT = 'ai.autopilot';
const USAGE_KEY = 'ai.reply_generation';

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function hash(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function monthWindow(date = new Date()) {
  return {
    start: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)),
    end: new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1)),
  };
}

async function entitlements(prisma: PrismaClient, organizationId: string): Promise<Set<string>> {
  const subscription = await prisma.subscription.findFirst({
    where: { organizationId, status: { in: ['TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE'] } },
    include: { plan: { include: { entitlements: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return new Set((subscription?.plan.entitlements ?? [])
    .filter((item) => item.value === true)
    .map((item) => item.key));
}

export async function getBrandVoice(prisma: PrismaClient, organizationId: string) {
  const stored = await prisma.brandVoiceProfile.findUnique({ where: { organizationId } });
  return brandVoiceSchema.parse(stored ? {
    tone: stored.tone,
    formality: stored.formality,
    primaryLanguage: stored.primaryLanguage,
    responseLength: stored.responseLength,
    greetingStyle: stored.greetingStyle,
    signature: stored.signature,
    preferredPhrases: stored.preferredPhrases,
    prohibitedPhrases: stored.prohibitedPhrases,
    legalDisclaimer: stored.legalDisclaimer,
    compensationPolicy: stored.compensationPolicy,
    escalationTriggers: stored.escalationTriggers,
    customInstructions: stored.customInstructions,
  } : {});
}

export async function saveBrandVoice(
  prisma: PrismaClient,
  input: { organizationId: string; actorUserId: string; value: unknown },
) {
  const value = brandVoiceSchema.parse(input.value);
  const stored = await prisma.$transaction(async (tx) => {
    const profile = await tx.brandVoiceProfile.upsert({
      where: { organizationId: input.organizationId },
      create: {
        organizationId: input.organizationId,
        ...value,
        preferredPhrases: json(value.preferredPhrases),
        prohibitedPhrases: json(value.prohibitedPhrases),
        escalationTriggers: json(value.escalationTriggers),
      },
      update: {
        ...value,
        preferredPhrases: json(value.preferredPhrases),
        prohibitedPhrases: json(value.prohibitedPhrases),
        escalationTriggers: json(value.escalationTriggers),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: 'ai.brand_voice.updated',
        entityType: 'brandVoiceProfile',
        entityId: profile.id,
      },
    });
    return profile;
  });
  return brandVoiceSchema.parse({
    tone: stored.tone,
    formality: stored.formality,
    primaryLanguage: stored.primaryLanguage,
    responseLength: stored.responseLength,
    greetingStyle: stored.greetingStyle,
    signature: stored.signature,
    preferredPhrases: stored.preferredPhrases,
    prohibitedPhrases: stored.prohibitedPhrases,
    legalDisclaimer: stored.legalDisclaimer,
    compensationPolicy: stored.compensationPolicy,
    escalationTriggers: stored.escalationTriggers,
    customInstructions: stored.customInstructions,
  });
}

export async function getReplyAutopilot(prisma: PrismaClient, organizationId: string) {
  const stored = await prisma.replyAutopilotPolicy.findUnique({ where: { organizationId } });
  return replyAutopilotSchema.parse(stored ? {
    enabled: stored.enabled,
    minimumRating: stored.minimumRating,
    maximumReputationRisk: stored.maximumReputationRisk,
    minimumAiConfidence: stored.minimumAiConfidence,
  } : {});
}

export async function saveReplyAutopilot(
  prisma: PrismaClient,
  input: { organizationId: string; actorUserId: string; value: unknown },
) {
  const value = replyAutopilotSchema.parse(input.value);
  const enabledFeatures = await entitlements(prisma, input.organizationId);
  if (value.enabled && !enabledFeatures.has(AUTOPILOT_ENTITLEMENT)) {
    throw new AppError({ code: 'ENTITLEMENT_REQUIRED', message: 'AI Autopilot недоступен на текущем тарифе', statusCode: 403, details: { entitlement: AUTOPILOT_ENTITLEMENT } });
  }
  const stored = await prisma.$transaction(async (tx) => {
    const policy = await tx.replyAutopilotPolicy.upsert({
      where: { organizationId: input.organizationId },
      create: { organizationId: input.organizationId, ...value },
      update: value,
    });
    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        action: 'ai.reply_autopilot.updated',
        entityType: 'replyAutopilotPolicy',
        entityId: policy.id,
        metadata: { enabled: policy.enabled },
      },
    });
    return policy;
  });
  return replyAutopilotSchema.parse(stored);
}

export async function enqueueAiReplyGeneration(
  prisma: PrismaClient,
  input: { organizationId: string; reviewId: string; actorUserId: string; mode: ReplyGenerationMode; instructions: string },
) {
  const enabledFeatures = await entitlements(prisma, input.organizationId);
  if (!enabledFeatures.has(REPLY_ENTITLEMENT)) {
    throw new AppError({ code: 'ENTITLEMENT_REQUIRED', message: 'AI Reply Copilot недоступен на текущем тарифе', statusCode: 403, details: { entitlement: REPLY_ENTITLEMENT } });
  }
  const review = await prisma.review.findFirst({
    where: { id: input.reviewId, organizationId: input.organizationId },
    select: { id: true, rating: true, text: true, updatedAt: true },
  });
  if (!review) throw new AppError({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден', statusCode: 404 });
  const insight = await prisma.reviewInsight.findFirst({
    where: { organizationId: input.organizationId, reviewId: input.reviewId },
    orderBy: [{ analysisVersion: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, inputHash: true },
  });
  if (!insight) throw new AppError({ code: 'REVIEW_INTELLIGENCE_REQUIRED', message: 'Сначала дождитесь AI-анализа отзыва', statusCode: 409 });

  const provider = aiProviderRegistry.active();
  const availability = provider?.availability();
  if (!provider || !provider.generateReply || !availability?.available) {
    throw new AppError({ code: availability?.reasonCode ?? 'AI_PROVIDER_UNAVAILABLE', message: availability?.reasonMessage ?? 'AI provider недоступен', statusCode: 422 });
  }

  const inputHash = hash({
    reviewId: review.id,
    reviewUpdatedAt: review.updatedAt.toISOString(),
    insightId: insight.id,
    mode: input.mode,
    instructions: input.instructions,
    promptVersion: AI_REPLY_PROMPT_VERSION,
  });
  return prisma.$transaction(async (tx) => {
    const operation = await tx.aiOperation.create({
      data: {
        organizationId: input.organizationId,
        reviewId: input.reviewId,
        insightId: insight.id,
        operationType: 'REVIEW_REPLY_GENERATION',
        provider: provider.id,
        model: provider.model,
        promptVersion: AI_REPLY_PROMPT_VERSION,
        inputHash,
        status: 'QUEUED',
      },
    });
    const job = await tx.job.create({
      data: {
        organizationId: input.organizationId,
        type: 'ai.generateReply',
        payload: {
          organizationId: input.organizationId,
          reviewId: input.reviewId,
          aiOperationId: operation.id,
          actorUserId: input.actorUserId,
          mode: input.mode,
          instructions: input.instructions,
        },
        dedupeKey: `ai:reply:${operation.id}`,
        maxAttempts: 5,
      },
    });
    return { operationId: operation.id, jobId: job.id, status: 'QUEUED' as const };
  });
}

function autopilotEligible(input: {
  enabled: boolean;
  minimumRating: number;
  maximumReputationRisk: number;
  minimumAiConfidence: number;
  rating: number;
  reputationRisk: number;
  legalPrRisk: boolean;
  safetyRisk: boolean;
  confidence: number;
  policyDecision: string;
}) {
  return input.enabled
    && input.rating >= input.minimumRating
    && input.reputationRisk <= input.maximumReputationRisk
    && !input.legalPrRisk
    && !input.safetyRisk
    && input.confidence >= input.minimumAiConfidence
    && input.policyDecision === 'ALLOW';
}

export async function processAiReplyGenerationJob(
  prisma: PrismaClient,
  input: { organizationId: string; reviewId: string; aiOperationId: string; actorUserId: string; mode: ReplyGenerationMode; instructions: string },
) {
  const enabledFeatures = await entitlements(prisma, input.organizationId);
  if (!enabledFeatures.has(REPLY_ENTITLEMENT)) {
    throw new AiProviderError({ code: 'AI_REPLY_ENTITLEMENT_DISABLED', message: 'AI Reply Copilot entitlement disabled', retryable: false });
  }
  const operation = await prisma.aiOperation.findFirst({ where: { id: input.aiOperationId, organizationId: input.organizationId, reviewId: input.reviewId } });
  if (!operation) throw new AiProviderError({ code: 'AI_OPERATION_NOT_FOUND', message: 'AI operation not found', retryable: false });
  if (operation.status === 'SUCCEEDED' || operation.status === 'SKIPPED') return;

  const review = await prisma.review.findFirst({
    where: { id: input.reviewId, organizationId: input.organizationId },
    include: {
      source: { select: { provider: true, name: true } },
      business: { select: { name: true } },
      location: { select: { name: true } },
    },
  });
  if (!review) throw new AiProviderError({ code: 'REVIEW_NOT_FOUND', message: 'Review not found', retryable: false });
  const insight = await prisma.reviewInsight.findFirst({
    where: { organizationId: input.organizationId, reviewId: input.reviewId },
    include: { aspects: true },
    orderBy: [{ analysisVersion: 'desc' }, { createdAt: 'desc' }],
  });
  if (!insight) throw new AiProviderError({ code: 'REVIEW_INTELLIGENCE_REQUIRED', message: 'Review insight missing', retryable: false });
  const voice = await getBrandVoice(prisma, input.organizationId);
  const provider = aiProviderRegistry.get(operation.provider);
  if (!provider?.generateReply || !provider.availability().available) {
    throw new AiProviderError({ code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI reply provider unavailable', retryable: false });
  }

  const startedAt = new Date();
  await prisma.aiOperation.update({ where: { id: operation.id }, data: { status: 'RUNNING', startedAt, errorCode: null, errorMessage: null } });
  try {
    const generated = await provider.generateReply({
      organizationId: input.organizationId,
      reviewId: input.reviewId,
      rating: review.rating,
      text: review.text,
      language: review.language,
      provider: review.source.provider,
      businessName: review.business.name,
      locationName: review.location?.name ?? null,
      mode: input.mode,
      instructions: input.instructions,
      brandVoice: voice,
      insight: {
        sentiment: insight.sentiment,
        operationalUrgency: insight.operationalUrgency,
        reputationRisk: insight.reputationRisk,
        legalPrRisk: insight.legalPrRisk,
        safetyRisk: insight.safetyRisk,
        observedFacts: insight.observedFacts,
        inferences: insight.inferences,
        recommendations: insight.recommendations,
        aspects: insight.aspects.map((item) => ({ aspect: item.aspect, sentiment: item.sentiment, confidence: item.confidence })),
      },
    });
    const policy = await evaluateReplyPolicy(prisma, {
      organizationId: input.organizationId,
      reviewId: input.reviewId,
      text: generated.output.reply,
      aiConfidence: generated.output.confidence,
      aiWarnings: generated.output.warnings,
    });
    const autopilot = await getReplyAutopilot(prisma, input.organizationId);
    const allowAutopilot = enabledFeatures.has(AUTOPILOT_ENTITLEMENT) && autopilotEligible({
      ...autopilot,
      rating: review.rating,
      reputationRisk: insight.reputationRisk,
      legalPrRisk: insight.legalPrRisk,
      safetyRisk: insight.safetyRisk,
      confidence: generated.output.confidence,
      policyDecision: policy.decision,
    });
    const completedAt = new Date();

    const createdReply = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ acquired: number }>>`
        SELECT 1::int AS acquired
        FROM (SELECT pg_advisory_xact_lock(hashtext(${input.reviewId}), 19)) AS advisory_lock
      `;
      const latest = await tx.reviewReply.findFirst({
        where: { organizationId: input.organizationId, reviewId: input.reviewId },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
        select: { version: true },
      });
      const reply = await tx.reviewReply.create({
        data: {
          organizationId: input.organizationId,
          reviewId: input.reviewId,
          authorUserId: input.actorUserId,
          text: generated.output.reply,
          status: allowAutopilot ? 'READY_TO_PUBLISH' : 'DRAFT',
          version: (latest?.version ?? 0) + 1,
          origin: allowAutopilot ? 'AUTOPILOT' : 'AI',
          generationMode: input.mode,
          policyDecision: policy.decision,
          policyVersion: policy.policyVersion,
          policyMetadata: json({ violations: policy.violations, warnings: policy.warnings, reasons: policy.reasons }),
        },
      });
      await tx.review.update({
        where: { id: input.reviewId },
        data: { status: 'DEFERRED', workflowStatus: allowAutopilot ? 'APPROVED' : 'DRAFT' },
      });
      await tx.aiOperation.update({
        where: { id: operation.id },
        data: {
          replyId: reply.id,
          status: 'SUCCEEDED',
          completedAt,
          latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
          outputHash: hash(generated.output),
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
          estimatedCostMicros: generated.estimatedCostMicros,
          confidence: generated.output.confidence,
        },
      });
      const period = monthWindow(completedAt);
      await tx.usage.upsert({
        where: { organizationId_key_periodStart_periodEnd: { organizationId: input.organizationId, key: USAGE_KEY, periodStart: period.start, periodEnd: period.end } },
        create: { organizationId: input.organizationId, key: USAGE_KEY, periodStart: period.start, periodEnd: period.end, value: 1 },
        update: { value: { increment: 1 } },
      });
      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId,
          action: 'review.reply.ai_generated',
          entityType: 'reviewReply',
          entityId: reply.id,
          metadata: { reviewId: input.reviewId, mode: input.mode, policyDecision: policy.decision, autopilot: allowAutopilot },
        },
      });
      return reply;
    });

    if (allowAutopilot) {
      try {
        await enqueueReplyPublication(prisma, {
          organizationId: input.organizationId,
          reviewId: input.reviewId,
          replyId: createdReply.id,
          actorUserId: input.actorUserId,
          trigger: 'autopilot',
        });
      } catch (error) {
        await prisma.auditLog.create({
          data: {
            organizationId: input.organizationId,
            actorUserId: input.actorUserId,
            action: 'review.reply.autopilot_blocked',
            entityType: 'reviewReply',
            entityId: createdReply.id,
            metadata: { reason: error instanceof Error ? error.message.slice(0, 500) : 'PROVIDER_UNAVAILABLE' },
          },
        });
      }
    }
    return createdReply;
  } catch (error) {
    const code = error instanceof AiProviderError ? error.code : 'AI_REPLY_GENERATION_FAILED';
    const message = error instanceof Error ? error.message : 'AI reply generation failed';
    await prisma.aiOperation.update({ where: { id: operation.id }, data: { status: 'FAILED', completedAt: new Date(), errorCode: code, errorMessage: message.slice(0, 2000) } });
    throw error;
  }
}

export async function getAiReplyOperation(prisma: PrismaClient, organizationId: string, reviewId: string, operationId: string) {
  const operation = await prisma.aiOperation.findFirst({
    where: { id: operationId, organizationId, reviewId, operationType: 'REVIEW_REPLY_GENERATION' },
    include: { reply: true },
  });
  if (!operation) return null;
  return {
    id: operation.id,
    status: operation.status,
    errorCode: operation.errorCode,
    errorMessage: operation.errorMessage,
    createdAt: operation.createdAt,
    completedAt: operation.completedAt,
    reply: operation.reply,
  };
}
