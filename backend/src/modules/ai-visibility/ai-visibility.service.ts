import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { assertEntitlement } from '../billing/billing.service.js';
import { aiProviderRegistry } from '../ai/ai-provider.registry.js';
import { AiProviderError } from '../ai/ai-provider.types.js';

const AI_VISIBILITY_ENTITLEMENT = 'ai_visibility.enabled';

type ActorContext = { organizationId: string; userId: string };

type ProbeCreateInput = {
  name: string;
  query: string;
  locationId?: string | null;
  languageCode: string;
  countryCode?: string | null;
};

type ProbeUpdateInput = {
  name?: string;
  query?: string;
  locationId?: string | null;
  languageCode?: string;
  countryCode?: string | null;
  status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
};

async function assertLocation(app: FastifyInstance, organizationId: string, locationId: string | null | undefined) {
  if (!locationId) return null;
  const location = await app.prisma.location.findFirst({
    where: { id: locationId, business: { organizationId } },
    select: { id: true, name: true },
  });
  if (!location) throw new AppError({ code: 'LOCATION_NOT_FOUND', message: 'Локация не найдена', statusCode: 404 });
  return location;
}

async function audit(app: FastifyInstance, context: ActorContext, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
  await app.prisma.auditLog.create({
    data: {
      organizationId: context.organizationId,
      actorUserId: context.userId,
      action,
      entityType: 'AiVisibilityProbe',
      entityId,
      ...(metadata ? { metadata } : {}),
    },
  });
}

export async function createVisibilityProbe(app: FastifyInstance, context: ActorContext, input: ProbeCreateInput) {
  await assertEntitlement(app, context.organizationId, AI_VISIBILITY_ENTITLEMENT);
  await assertLocation(app, context.organizationId, input.locationId);
  const probe = await app.prisma.aiVisibilityProbe.create({
    data: {
      organizationId: context.organizationId,
      createdByUserId: context.userId,
      name: input.name,
      query: input.query,
      languageCode: input.languageCode,
      ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
    },
  });
  await audit(app, context, 'ai_visibility.probe.created', probe.id);
  return probe;
}

export async function listVisibilityProbes(app: FastifyInstance, organizationId: string, input: { status?: 'ACTIVE' | 'PAUSED' | 'ARCHIVED'; limit: number; cursor?: string }) {
  const rows = await app.prisma.aiVisibilityProbe.findMany({
    where: { organizationId, ...(input.status !== undefined ? { status: input.status } : {}) },
    include: {
      location: { select: { id: true, name: true, city: true } },
      runs: { orderBy: { createdAt: 'desc' }, take: 1, include: { result: { include: { citations: true, competitors: true } } } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: input.limit + 1,
    ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > input.limit;
  const items = hasMore ? rows.slice(0, input.limit) : rows;
  return { items, nextCursor: hasMore ? items.at(-1)?.id ?? null : null };
}

export async function getVisibilityProbe(app: FastifyInstance, organizationId: string, probeId: string) {
  const probe = await app.prisma.aiVisibilityProbe.findFirst({
    where: { id: probeId, organizationId },
    include: {
      location: { select: { id: true, name: true, city: true } },
      runs: { orderBy: { createdAt: 'desc' }, take: 30, include: { result: { include: { citations: true, competitors: true } } } },
    },
  });
  if (!probe) throw new AppError({ code: 'AI_VISIBILITY_PROBE_NOT_FOUND', message: 'AI Visibility probe не найден', statusCode: 404 });
  return probe;
}

export async function updateVisibilityProbe(app: FastifyInstance, context: ActorContext, probeId: string, input: ProbeUpdateInput) {
  await assertEntitlement(app, context.organizationId, AI_VISIBILITY_ENTITLEMENT);
  const existing = await app.prisma.aiVisibilityProbe.findFirst({ where: { id: probeId, organizationId: context.organizationId } });
  if (!existing) throw new AppError({ code: 'AI_VISIBILITY_PROBE_NOT_FOUND', message: 'AI Visibility probe не найден', statusCode: 404 });
  if (input.locationId !== undefined) await assertLocation(app, context.organizationId, input.locationId);
  const archivedAt = input.status === 'ARCHIVED' ? new Date() : input.status !== undefined ? null : undefined;
  const probe = await app.prisma.aiVisibilityProbe.update({
    where: { id: existing.id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.query !== undefined ? { query: input.query } : {}),
      ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
      ...(input.languageCode !== undefined ? { languageCode: input.languageCode } : {}),
      ...(input.countryCode !== undefined ? { countryCode: input.countryCode } : {}),
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(archivedAt !== undefined ? { archivedAt } : {}),
    },
  });
  await audit(app, context, 'ai_visibility.probe.updated', probe.id, { changedFields: Object.keys(input) });
  return probe;
}

export async function enqueueVisibilityRun(app: FastifyInstance, context: ActorContext, probeId: string) {
  await assertEntitlement(app, context.organizationId, AI_VISIBILITY_ENTITLEMENT);
  const probe = await app.prisma.aiVisibilityProbe.findFirst({ where: { id: probeId, organizationId: context.organizationId } });
  if (!probe) throw new AppError({ code: 'AI_VISIBILITY_PROBE_NOT_FOUND', message: 'AI Visibility probe не найден', statusCode: 404 });
  if (probe.status !== 'ACTIVE') throw new AppError({ code: 'AI_VISIBILITY_PROBE_NOT_ACTIVE', message: 'Probe должен быть активен', statusCode: 409 });
  const provider = aiProviderRegistry.active();
  if (!provider) throw new AppError({ code: 'AI_PROVIDER_UNAVAILABLE', message: 'AI provider недоступен', statusCode: 503 });
  const availability = provider.availability();
  if (!availability.available) {
    throw new AppError({ code: availability.reasonCode ?? 'AI_PROVIDER_UNAVAILABLE', message: availability.reasonMessage ?? 'AI provider недоступен', statusCode: 503 });
  }
  if (!provider.runVisibilityProbe) {
    throw new AppError({ code: 'AI_VISIBILITY_PROVIDER_UNSUPPORTED', message: 'Активный AI provider не поддерживает web-grounded visibility probes', statusCode: 503 });
  }

  const active = await app.prisma.aiVisibilityRun.findFirst({ where: { organizationId: context.organizationId, probeId, status: { in: ['QUEUED', 'RUNNING'] } } });
  if (active) return { run: active, deduplicated: true };

  const run = await app.prisma.$transaction(async (tx) => {
    const created = await tx.aiVisibilityRun.create({
      data: { organizationId: context.organizationId, probeId, createdByUserId: context.userId, status: 'QUEUED' },
    });
    await tx.job.create({
      data: {
        organizationId: context.organizationId,
        type: 'aiVisibility.run',
        payload: { organizationId: context.organizationId, runId: created.id },
        dedupeKey: `aiVisibility.run:${created.id}`,
        maxAttempts: 4,
      },
    });
    return created;
  });
  await audit(app, context, 'ai_visibility.run.queued', probe.id, { runId: run.id });
  return { run, deduplicated: false };
}

function domainFromUrl(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export async function processVisibilityRunJob(prisma: PrismaClient, input: { organizationId: string; runId: string }) {
  const run = await prisma.aiVisibilityRun.findFirst({
    where: { id: input.runId, organizationId: input.organizationId },
    include: {
      probe: {
        include: {
          location: { select: { name: true } },
          organization: { include: { businesses: { where: { status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }], take: 1 } } },
        },
      },
      result: true,
    },
  });
  if (!run) throw new AiProviderError({ code: 'AI_VISIBILITY_RUN_NOT_FOUND', message: 'AI Visibility run not found', retryable: false });
  if (run.status === 'SUCCEEDED' && run.result) return run.result;

  const provider = aiProviderRegistry.active();
  if (!provider || !provider.runVisibilityProbe) {
    await prisma.aiVisibilityRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorCode: 'AI_VISIBILITY_PROVIDER_UNSUPPORTED', errorMessage: 'AI visibility provider unavailable', completedAt: new Date() } });
    throw new AiProviderError({ code: 'AI_VISIBILITY_PROVIDER_UNSUPPORTED', message: 'AI visibility provider unavailable', retryable: false });
  }
  const availability = provider.availability();
  if (!availability.available) {
    const code = availability.reasonCode ?? 'AI_PROVIDER_UNAVAILABLE';
    await prisma.aiVisibilityRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorCode: code, errorMessage: availability.reasonMessage ?? 'AI provider unavailable', completedAt: new Date() } });
    throw new AiProviderError({ code, message: availability.reasonMessage ?? 'AI provider unavailable', retryable: false });
  }

  const businessName = run.probe.organization.businesses[0]?.name ?? run.probe.organization.name;
  const inputHash = crypto.createHash('sha256').update(JSON.stringify({
    query: run.probe.query,
    businessName,
    locationName: run.probe.location?.name ?? null,
    languageCode: run.probe.languageCode,
    countryCode: run.probe.countryCode,
  })).digest('hex');

  await prisma.aiVisibilityRun.update({
    where: { id: run.id },
    data: { status: 'RUNNING', startedAt: new Date(), completedAt: null, errorCode: null, errorMessage: null, inputHash },
  });

  try {
    const response = await provider.runVisibilityProbe({
      organizationId: input.organizationId,
      probeId: run.probeId,
      query: run.probe.query,
      businessName,
      locationName: run.probe.location?.name ?? null,
      languageCode: run.probe.languageCode,
      countryCode: run.probe.countryCode,
    });

    const knownCompetitors = await prisma.competitiveCompetitor.findMany({
      where: { organizationId: input.organizationId, status: 'ACTIVE' },
      select: { id: true, name: true },
    });
    const competitorByName = new Map(knownCompetitors.map((item) => [item.name.trim().toLocaleLowerCase(), item.id]));

    return await prisma.$transaction(async (tx) => {
      await tx.aiVisibilityResult.deleteMany({ where: { runId: run.id } });
      const result = await tx.aiVisibilityResult.create({
        data: {
          organizationId: input.organizationId,
          runId: run.id,
          brandMentioned: response.output.brandMentioned,
          brandPosition: response.output.brandPosition,
          sentiment: response.output.sentiment,
          answerText: response.output.answerSummary,
          recommendations: response.output.recommendations,
          citationMeasurement: response.citationMeasurement,
        },
      });
      if (response.citations.length > 0) {
        await tx.aiVisibilityCitation.createMany({
          data: response.citations.map((citation, index) => ({
            organizationId: input.organizationId,
            resultId: result.id,
            url: citation.url,
            title: citation.title,
            domain: domainFromUrl(citation.url),
            position: index + 1,
          })),
        });
      }
      if (response.output.competitors.length > 0) {
        await tx.aiVisibilityCompetitor.createMany({
          data: response.output.competitors.map((competitor) => ({
            organizationId: input.organizationId,
            resultId: result.id,
            name: competitor.name,
            position: competitor.position,
            matchedCompetitorId: competitorByName.get(competitor.name.trim().toLocaleLowerCase()) ?? null,
          })),
        });
      }
      await tx.aiVisibilityRun.update({
        where: { id: run.id },
        data: {
          status: 'SUCCEEDED',
          provider: response.provider,
          model: response.model,
          modelVersion: response.modelVersion,
          promptVersion: response.promptVersion,
          inputTokens: response.inputTokens,
          outputTokens: response.outputTokens,
          estimatedCostMicros: response.estimatedCostMicros === null ? null : BigInt(response.estimatedCostMicros),
          completedAt: new Date(),
          errorCode: null,
          errorMessage: null,
        },
      });
      return result;
    });
  } catch (error) {
    const code = error instanceof AiProviderError ? error.code : 'AI_VISIBILITY_RUN_FAILED';
    const message = error instanceof Error ? error.message : String(error);
    await prisma.aiVisibilityRun.update({
      where: { id: run.id },
      data: { status: 'FAILED', errorCode: code, errorMessage: message.slice(0, 4000), completedAt: new Date() },
    });
    throw error;
  }
}

export async function getVisibilityRun(app: FastifyInstance, organizationId: string, runId: string) {
  const run = await app.prisma.aiVisibilityRun.findFirst({
    where: { id: runId, organizationId },
    include: { probe: true, result: { include: { citations: true, competitors: true } } },
  });
  if (!run) throw new AppError({ code: 'AI_VISIBILITY_RUN_NOT_FOUND', message: 'AI Visibility run не найден', statusCode: 404 });
  return run;
}

export async function visibilityMetrics(app: FastifyInstance, organizationId: string, input: { from?: Date; to?: Date; locationId?: string }) {
  const runs = await app.prisma.aiVisibilityRun.findMany({
    where: {
      organizationId,
      status: 'SUCCEEDED',
      ...(input.from || input.to ? { completedAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } } : {}),
      ...(input.locationId ? { probe: { locationId: input.locationId } } : {}),
    },
    include: { probe: { select: { locationId: true } }, result: { include: { citations: true, competitors: true } } },
    orderBy: { completedAt: 'asc' },
  });
  const measured = runs.filter((run) => run.result !== null);
  const sampleSize = measured.length;
  const brandMentions = measured.filter((run) => run.result?.brandMentioned).length;
  const positionValues = measured.flatMap((run) => run.result?.brandPosition ? [run.result.brandPosition] : []);
  const competitorMentions = measured.reduce((sum, run) => sum + (run.result?.competitors.length ?? 0), 0);
  const runsWithCompetitor = measured.filter((run) => (run.result?.competitors.length ?? 0) > 0).length;
  const citationMeasuredRuns = measured.filter((run) => run.result?.citationMeasurement === 'SUPPORTED');
  const citationCoveredRuns = citationMeasuredRuns.filter((run) => (run.result?.citations.length ?? 0) > 0).length;
  const sentiment = Object.fromEntries(['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'MIXED', 'UNKNOWN'].map((key) => [key, measured.filter((run) => run.result?.sentiment === key).length]));
  const locationMap = new Map<string, { runs: number; mentions: number }>();
  for (const run of measured) {
    if (!run.probe.locationId) continue;
    const current = locationMap.get(run.probe.locationId) ?? { runs: 0, mentions: 0 };
    current.runs += 1;
    if (run.result?.brandMentioned) current.mentions += 1;
    locationMap.set(run.probe.locationId, current);
  }
  const voiceDenominator = brandMentions + competitorMentions;
  return {
    sampleSize,
    brandMentionRate: sampleSize ? Number(((brandMentions / sampleSize) * 100).toFixed(1)) : null,
    shareOfAiVoice: voiceDenominator ? Number(((brandMentions / voiceDenominator) * 100).toFixed(1)) : null,
    averageAiPosition: positionValues.length ? Number((positionValues.reduce((sum, value) => sum + value, 0) / positionValues.length).toFixed(2)) : null,
    competitorMentionRate: sampleSize ? Number(((runsWithCompetitor / sampleSize) * 100).toFixed(1)) : null,
    citationCoverage: citationMeasuredRuns.length ? Number(((citationCoveredRuns / citationMeasuredRuns.length) * 100).toFixed(1)) : null,
    citationQuality: { measured: false, reason: 'P23 does not infer source quality from domain heuristics; provider/source-quality signals are required.' },
    aiSentiment: sentiment,
    locationVisibility: [...locationMap.entries()].map(([locationId, value]) => ({ locationId, sampleSize: value.runs, mentionRate: Number(((value.mentions / value.runs) * 100).toFixed(1)) })),
    methodology: {
      brandMentionRate: 'runs mentioning the target brand / succeeded runs',
      shareOfAiVoice: 'target brand mentions / (target brand mentions + detected competitor mentions)',
      averageAiPosition: 'mean ordinal brand position for runs where an ordinal position was measurable',
      citationCoverage: 'web-grounded runs with one or more provider citations / web-grounded runs',
    },
  };
}
