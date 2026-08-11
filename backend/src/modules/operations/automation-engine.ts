import type { FastifyInstance } from 'fastify';
import { createCaseFromReview } from '../cases/cases.service.js';

type AutomationEvent = {
  type: 'new_review' | 'unanswered_age';
  organizationId: string;
  dedupeKey: string;
  actorUserId?: string | null;
  review?: {
    id: string;
    rating: number;
    businessId?: string | null;
    locationId?: string | null;
    author?: string | null;
    provider?: string | null;
  };
};

type ActionDefinition = { type?: string; config?: Record<string, unknown> } | string;

type AutomationRecord = {
  id: string;
  name: string;
  trigger: string;
  enabled: boolean;
  conditions: unknown;
  actions: unknown;
};

type AutomationRuntime = { caseId?: string };

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function normalizedTopic(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('ru-RU').replace(/\s+/g, '-') : '';
}

function aspectMatchesTopic(aspect: string, topic: string): boolean {
  return normalizedTopic(aspect) === normalizedTopic(topic);
}

async function reviewMatchesTopic(app: FastifyInstance, event: AutomationEvent, topic: string): Promise<boolean> {
  if (!event.review || !topic) return true;
  const insight = await app.prisma.reviewInsight.findFirst({
    where: { organizationId: event.organizationId, reviewId: event.review.id },
    orderBy: [{ analysisVersion: 'desc' }, { createdAt: 'desc' }],
    select: { aspects: { select: { aspect: true, sentiment: true } } },
  });
  return insight?.aspects.some((aspect) => (
    aspectMatchesTopic(aspect.aspect, topic)
    && (aspect.sentiment === 'NEGATIVE' || aspect.sentiment === 'MIXED')
  )) ?? false;
}

async function similarReviewCount(
  app: FastifyInstance,
  event: AutomationEvent,
  topic: string,
  maximumRating: number,
  windowDays: number,
): Promise<number> {
  if (!event.review?.locationId || !topic) return 0;
  const since = new Date(Date.now() - Math.max(1, Math.min(windowDays, 90)) * 24 * 60 * 60 * 1000);
  const reviews = await app.prisma.review.findMany({
    where: {
      organizationId: event.organizationId,
      locationId: event.review.locationId,
      rating: { lte: maximumRating },
      status: { not: 'ARCHIVED' },
      receivedAt: { gte: since },
    },
    select: {
      id: true,
      insights: {
        orderBy: [{ analysisVersion: 'desc' }, { createdAt: 'desc' }],
        take: 1,
        select: { aspects: { select: { aspect: true, sentiment: true } } },
      },
    },
    take: 500,
  });
  return reviews.filter((review) => review.insights[0]?.aspects.some((aspect) => (
    aspectMatchesTopic(aspect.aspect, topic)
    && (aspect.sentiment === 'NEGATIVE' || aspect.sentiment === 'MIXED')
  ))).length;
}

async function matchesAutomation(app: FastifyInstance, automation: AutomationRecord, event: AutomationEvent): Promise<boolean> {
  if (!automation.enabled) return false;
  const conditions = asObject(automation.conditions);

  if (['review.received', 'new_review', 'negative_review', 'rating_at_most'].includes(automation.trigger)) {
    if (event.type !== 'new_review' || !event.review) return false;
    const rating = Number(event.review.rating);
    let min = Number(conditions.ratingMin ?? 1);
    let max = Number(conditions.ratingMax ?? conditions.rating ?? 5);
    if (automation.trigger === 'negative_review') max = Math.min(max, 2);
    if (automation.trigger === 'rating_at_most') max = Number(conditions.rating ?? conditions.ratingMax ?? 2);
    if (!Number.isFinite(min)) min = 1;
    if (!Number.isFinite(max)) max = 5;
    if (rating < min || rating > max) return false;

    const platforms = stringArray(conditions.platforms).map((item) => item.toLowerCase());
    if (platforms.length && event.review.provider && !platforms.includes(event.review.provider.toLowerCase())) return false;

    const topic = normalizedTopic(conditions.topic);
    if (topic && !await reviewMatchesTopic(app, event, topic)) return false;

    const similarReviewsMin = Number(conditions.similarReviewsMin ?? 0);
    if (Number.isFinite(similarReviewsMin) && similarReviewsMin > 0) {
      const windowDays = Number(conditions.similarWindowDays ?? 7);
      if (!Number.isFinite(windowDays) || windowDays <= 0) return false;
      const count = await similarReviewCount(app, event, topic, max, windowDays);
      if (count < similarReviewsMin) return false;
    }
    return true;
  }

  if (automation.trigger === 'review.sla_at_risk') return event.type === 'unanswered_age' && conditions.state === 'at_risk';
  if (automation.trigger === 'review.sla_breached') return event.type === 'unanswered_age' && conditions.state === 'breached';
  return false;
}

function normalizeActions(actions: unknown): Array<{ type: string; config: Record<string, unknown> }> {
  if (!Array.isArray(actions)) return [];
  return actions.flatMap((action: ActionDefinition) => {
    if (typeof action === 'string') return [{ type: action, config: {} }];
    if (!action || typeof action !== 'object' || !action.type) return [];
    return [{ type: action.type, config: action.config ?? {} }];
  });
}

async function resolveActorUserId(app: FastifyInstance, event: AutomationEvent): Promise<string | null> {
  if (event.actorUserId) {
    const member = await app.prisma.organizationMember.findFirst({
      where: { organizationId: event.organizationId, userId: event.actorUserId, status: 'ACTIVE' },
      select: { userId: true },
    });
    if (member) return member.userId;
  }
  const member = await app.prisma.organizationMember.findFirst({
    where: { organizationId: event.organizationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  });
  return member?.userId ?? null;
}

async function executeAction(
  app: FastifyInstance,
  automation: AutomationRecord,
  event: AutomationEvent,
  actorUserId: string | null,
  action: { type: string; config: Record<string, unknown> },
  runtime: AutomationRuntime,
) {
  const review = event.review;

  if (action.type === 'create_case' && review) {
    const configuredSeverity = typeof action.config.severity === 'string'
      && ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(action.config.severity.toUpperCase())
      ? action.config.severity.toUpperCase() as 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
      : undefined;
    const slaMinutes = Number(action.config.slaMinutes);
    const result = await createCaseFromReview(app, {
      organizationId: event.organizationId,
      userId: actorUserId,
    }, review.id, {
      origin: 'AUTOMATION',
      locationIds: review.locationId ? [review.locationId] : [],
      sourceDedupeKey: `automation:${automation.id}:${event.dedupeKey}`,
      ...(typeof action.config.title === 'string' && action.config.title.trim() ? { title: action.config.title.trim().slice(0, 240) } : {}),
      ...(typeof action.config.category === 'string' && action.config.category.trim() ? { category: action.config.category.trim().slice(0, 120) } : {}),
      ...(configuredSeverity ? { severity: configuredSeverity } : {}),
      ...(typeof action.config.ownerMemberId === 'string' ? { ownerMemberId: action.config.ownerMemberId } : {}),
      ...(Number.isFinite(slaMinutes) && slaMinutes >= 0 ? { slaMinutes: Math.round(slaMinutes) } : {}),
    });
    runtime.caseId = result.case.id;
    return { type: action.type, caseId: result.case.id, deduplicated: result.deduplicated };
  }

  if (action.type === 'create_task' && review) {
    if (!actorUserId) return { type: action.type, skipped: 'NO_ACTIVE_MEMBER' };
    const title = String(action.config.title || `Обработать негативный отзыв ${review.rating}★`).slice(0, 240);
    const priority = Number(review.rating) <= 1 ? 'CRITICAL' : 'HIGH';
    const existing = await app.prisma.task.findFirst({
      where: { organizationId: event.organizationId, reviewId: review.id, archivedAt: null },
      select: { id: true, caseId: true },
    });
    if (existing) {
      if (runtime.caseId && !existing.caseId) {
        await app.prisma.task.update({ where: { id: existing.id }, data: { caseId: runtime.caseId } });
      }
      return { type: action.type, taskId: existing.id, caseId: runtime.caseId ?? existing.caseId, deduplicated: true };
    }
    const task = await app.prisma.task.create({
      data: {
        organizationId: event.organizationId,
        reviewId: review.id,
        caseId: runtime.caseId ?? null,
        businessId: review.businessId ?? null,
        locationId: review.locationId ?? null,
        title,
        description: String(action.config.description || `Автоматически создано правилом «${automation.name}»`),
        priority,
        status: 'NEW',
        createdByUserId: actorUserId,
      },
    });
    return { type: action.type, taskId: task.id, caseId: runtime.caseId ?? null };
  }

  if ((action.type === 'assign_manager' || action.type === 'assign_shield') && review) {
    const member = await app.prisma.organizationMember.findFirst({
      where: {
        organizationId: event.organizationId,
        status: 'ACTIVE',
        role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, userId: true },
    });
    if (!member) return { type: action.type, skipped: 'NO_MANAGER' };
    await app.prisma.reviewAssignment.upsert({
      where: { reviewId_organizationMemberId: { reviewId: review.id, organizationMemberId: member.id } },
      create: {
        organizationId: event.organizationId,
        reviewId: review.id,
        organizationMemberId: member.id,
        assignedByUserId: actorUserId ?? member.userId,
        status: 'ACTIVE',
        note: `Автоматизация: ${automation.name}`,
      },
      update: { status: 'ACTIVE', completedAt: null, note: `Автоматизация: ${automation.name}` },
    });
    if (runtime.caseId) {
      await app.prisma.reputationCase.updateMany({
        where: { id: runtime.caseId, organizationId: event.organizationId, ownerMemberId: null },
        data: { ownerMemberId: member.id },
      });
    }
    return { type: action.type, memberId: member.id, caseId: runtime.caseId ?? null };
  }

  if (action.type === 'send_for_approval' && review) {
    const draft = await app.prisma.reviewReply.findFirst({
      where: { organizationId: event.organizationId, reviewId: review.id, status: 'DRAFT' },
      orderBy: { version: 'desc' },
    });
    if (!draft) return { type: action.type, skipped: 'NO_DRAFT_REPLY' };
    await app.prisma.$transaction([
      app.prisma.reviewReply.update({ where: { id: draft.id }, data: { status: 'PENDING' } }),
      app.prisma.review.update({ where: { id: review.id }, data: { workflowStatus: 'AWAITING_APPROVAL' } }),
    ]);
    return { type: action.type, replyId: draft.id };
  }

  if (action.type === 'notify') {
    const title = String(action.config.title || automation.name).slice(0, 240);
    const body = review
      ? String(action.config.body || `Новый отзыв ${review.rating}★ требует внимания`)
      : String(action.config.body || 'Автоматизация сработала');
    const notification = await app.prisma.notification.create({
      data: {
        organizationId: event.organizationId,
        type: 'automation',
        title,
        body,
        payload: { automationId: automation.id, reviewId: review?.id ?? null, caseId: runtime.caseId ?? null },
      },
    });
    return { type: action.type, notificationId: notification.id, caseId: runtime.caseId ?? null };
  }

  return { type: action.type, skipped: 'UNSUPPORTED_ACTION' };
}

export async function dispatchAutomationEvent(app: FastifyInstance, event: AutomationEvent) {
  const automations = await app.prisma.automation.findMany({
    where: { organizationId: event.organizationId, enabled: true },
  });
  const actorUserId = await resolveActorUserId(app, event);

  const results: Array<Record<string, unknown>> = [];
  for (const automation of automations) {
    if (!await matchesAutomation(app, automation, event)) continue;
    const executionDedupeKey = `${event.type}:${event.dedupeKey}`;

    const existing = await app.prisma.automationExecution.findUnique({
      where: { automationId_dedupeKey: { automationId: automation.id, dedupeKey: executionDedupeKey } },
    });
    if (existing) {
      results.push({ automationId: automation.id, deduplicated: true, status: existing.status });
      continue;
    }

    const claimed = await app.prisma.automationExecution.create({
      data: {
        organizationId: event.organizationId,
        automationId: automation.id,
        dedupeKey: executionDedupeKey,
        status: 'RUNNING',
        triggerPayload: JSON.parse(JSON.stringify(event)),
      },
    });

    try {
      const effects: Array<Record<string, unknown>> = [];
      const runtime: AutomationRuntime = {};
      for (const action of normalizeActions(automation.actions)) {
        effects.push(await executeAction(app, automation, event, actorUserId, action, runtime));
      }
      await app.prisma.$transaction([
        app.prisma.automationExecution.update({
          where: { id: claimed.id },
          data: { status: 'SUCCESS', actionResult: JSON.parse(JSON.stringify(effects)), finishedAt: new Date() },
        }),
        app.prisma.automation.update({ where: { id: automation.id }, data: { lastRunAt: new Date() } }),
      ]);
      results.push({ automationId: automation.id, status: 'SUCCESS', effects });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await app.prisma.automationExecution.update({
        where: { id: claimed.id },
        data: { status: 'FAILED', errorMessage: message.slice(0, 4000), finishedAt: new Date() },
      });
      results.push({ automationId: automation.id, status: 'FAILED' });
    }
  }
  return results;
}
