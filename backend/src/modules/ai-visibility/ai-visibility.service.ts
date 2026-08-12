import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { assertEntitlement } from '../billing/billing.service.js';
import { aiProviderRegistry } from '../ai/ai-provider.registry.js';
import { AiProviderError } from '../ai/ai-provider.types.js';

// Keep the service-level defense-in-depth gate aligned with the commercial
// entitlement catalog. Route gates are not the only callers of this service.
const AI_VISIBILITY_ENTITLEMENT = 'aiVisibility';

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
    const competitorByName = new Map(knownCompetitors.map((item) => [item.name.trim().toLowerCase(), item]));
    const sourceDomains = [...new Set(response.citations.map((item) => item.domain ?? domainFromUrl(item.url)).filter((item): item is string => Boolean(item)))];
    const ranking = response.rankingPosition ?? (response.mentioned ? 1 : null);
    const visibilityScore = Math.max(0, Math.min(100, Math.round(response.confidence * (response.mentioned ? 82 : 26) + (ranking ? Math.max(0, 18 - (ranking - 1) * 4) : 0)));

    await prisma.$transaction(async (tx) => {
      const result = await tx.aiVisibilityResult.upsert({
        where: { runId: run.id },
        create: {
          organizationId: input.organizationId,
          runId: run.id,
          provider: response.provider,
          model: response.model,
          mentioned: response.mentioned,
          sentiment: response.sentiment,
          confidence: response.confidence,
          visibilityScore,
          rankingPosition: ranking,
          answerSnippet: response.answerSnippet,
          sourceDomains,
        },
        update: {
          provider: response.provider,
          model: response.model,
          mentioned: response.mentioned,
          sentiment: response.sentiment,
          confidence: response.confidence,
          visibilityScore,
          rankingPosition: ranking,
          answerSnippet: response.answerSnippet,
          sourceDomains,
          observedAt: new Date(),
        },
      });
      await tx.aiVisibilityCitation.deleteMany({ where: { resultId: result.id } });
      await tx.aiVisibilityCompetitor.deleteMany({ where: { resultId: result.id } });
      if (response.citations.length) {
        await tx.aiVisibilityCitation.createMany({ data: response.citations.map((item, index) => ({
          organizationId: input.organizationId,
          resultId: result.id,
          url: item.url,
          title: item.title ?? null,
          domain: item.domain ?? domainFromUrl(item.url),
          snippet: item.snippet ?? null,
          position: item.position ?? index + 1,
        })) });
      }
      if (response.competitors.length) {
        await tx.aiVisibilityCompetitor.createMany({ data: response.competitors.map((item) => ({
          organizationId: input.organizationId,
          resultId: result.id,
          competitorId: item.competitorId ?? competitorByName.get(item.name.trim().toLowerCase())?.id ?? null,
          name: item.name,
          mentioned: item.mentioned,
          rankingPosition: item.rankingPosition ?? null,
          sentiment: item.sentiment ?? null,
        })) });
      }
      await tx.aiVisibilityRun.update({
        where: { id: run.id },
        data: { status: 'SUCCEEDED', startedAt: run.startedAt ?? new Date(), completedAt: new Date(), errorCode: null, errorMessage: null },
      });
      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: run.createdByUserId,
          action: 'ai_visibility.run.completed',
          entityType: 'AiVisibilityRun',
          entityId: run.id,
          metadata: { provider: response.provider, model: response.model, visibilityScore, rankingPosition: ranking, citationCount: response.citations.length, competitorCount: response.competitors.length },
        },
      });
    });
    return { runId: run.id, status: 'SUCCEEDED' as const };
  } catch (error) {
    const providerError = error instanceof AiProviderError ? error : new AiProviderError({ code: 'AI_VISIBILITY_PROVIDER_FAILED', message: error instanceof Error ? error.message : 'AI visibility provider failed', retryable: true });
    await prisma.aiVisibilityRun.update({ where: { id: run.id }, data: { status: 'FAILED', errorCode: providerError.code, errorMessage: providerError.message, completedAt: new Date() } });
    throw providerError;
  }
}

export async function getVisibilityRun(app: FastifyInstance, organizationId: string, runId: string) {
  const run = await app.prisma.aiVisibilityRun.findFirst({
    where: { id: runId, organizationId },
    include: { probe: { select: { id: true, name: true, query: true } }, result: { include: { citations: true, competitors: true } } },
  });
  if (!run) throw new AppError({ code: 'AI_VISIBILITY_RUN_NOT_FOUND', message: 'AI Visibility run не найден', statusCode: 404 });
  return run;
}

export async function visibilityMetrics(app: FastifyInstance, organizationId: string, input: { from?: Date; to?: Date; locationId?: string }) {
  const from = input.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = input.to ?? new Date();
  const probes = await app.prisma.aiVisibilityProbe.findMany({
    where: { organizationId, ...(input.locationId !== undefined ? { locationId: input.locationId } : {}) },
    select: { id: true },
  });
  const probeIds = probes.map((item) => item.id);
  const results = await app.prisma.aiVisibilityResult.findMany({
    where: { organizationId, run: { probeId: { in: probeIds }, createdAt: { gte: from, lte: to }, status: 'SUCCEEDED' } },
    orderBy: { observedAt: 'asc' },
  });
  const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    probes: probeIds.length,
    completedRuns: results.length,
    mentionRate: results.length ? average(results.map((item) => item.mentioned ? 1 : 0)) : 0,
    averageVisibilityScore: Math.round(average(results.map((item) => item.visibilityScore))),
    averageRankingPosition: results.some((item) => item.rankingPosition) ? Number(average(results.flatMap((item) => item.rankingPosition ? [item.rankingPosition] : [])).toFixed(2)) : null,
  };
}
