import type { FastifyInstance } from 'fastify';

type AutomationEvent = {
  type: 'new_review' | 'negative_review' | 'rating_at_most' | 'unanswered_age';
  organizationId: string;
  dedupeKey: string;
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

function matchesAutomation(automation: any, event: AutomationEvent): boolean {
  if (!automation.enabled) return false;
  if (automation.trigger === 'new_review') return event.type === 'new_review';
  if (automation.trigger === 'negative_review') return event.type === 'new_review' && Number(event.review?.rating ?? 5) <= 2;
  if (automation.trigger === 'rating_at_most') {
    if (event.type !== 'new_review') return false;
    const conditions = automation.conditions && typeof automation.conditions === 'object' ? automation.conditions : {};
    const threshold = Number((conditions as any).rating ?? (conditions as any).ratingMax ?? 2);
    return Number(event.review?.rating ?? 5) <= threshold;
  }
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

async function executeAction(app: FastifyInstance, automation: any, event: AutomationEvent, action: { type: string; config: Record<string, unknown> }) {
  const review = event.review;

  if (action.type === 'create_task' && review) {
    const title = String(action.config.title || `Обработать негативный отзыв ${review.rating}★`).slice(0, 240);
    const priority = Number(review.rating) <= 1 ? 'CRITICAL' : 'HIGH';
    const existing = await app.prisma.task.findFirst({
      where: { organizationId: event.organizationId, reviewId: review.id, archivedAt: null },
      select: { id: true },
    });
    if (existing) return { type: action.type, taskId: existing.id, deduplicated: true };
    const task = await app.prisma.task.create({
      data: {
        organizationId: event.organizationId,
        reviewId: review.id,
        businessId: review.businessId ?? null,
        locationId: review.locationId ?? null,
        title,
        description: String(action.config.description || `Автоматически создано правилом «${automation.name}»`),
        priority,
        status: 'NEW',
        createdByUserId: automation.createdByUserId,
      },
    });
    return { type: action.type, taskId: task.id };
  }

  if (action.type === 'assign_manager' && review) {
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
        assignedByUserId: automation.createdByUserId,
        status: 'ACTIVE',
        note: `Автоматизация: ${automation.name}`,
      },
      update: { status: 'ACTIVE', completedAt: null, note: `Автоматизация: ${automation.name}` },
    });
    return { type: action.type, memberId: member.id };
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
        payload: { automationId: automation.id, reviewId: review?.id ?? null },
      },
    });
    return { type: action.type, notificationId: notification.id };
  }

  return { type: action.type, skipped: 'UNSUPPORTED_ACTION' };
}

export async function dispatchAutomationEvent(app: FastifyInstance, event: AutomationEvent) {
  const automations = await app.prisma.automation.findMany({
    where: { organizationId: event.organizationId, enabled: true },
  });

  const results = [];
  for (const automation of automations) {
    if (!matchesAutomation(automation, event)) continue;
    const executionDedupeKey = `${event.type}:${event.dedupeKey}`;

    const claimed = await app.prisma.automationExecution.upsert({
      where: { automationId_dedupeKey: { automationId: automation.id, dedupeKey: executionDedupeKey } },
      create: {
        organizationId: event.organizationId,
        automationId: automation.id,
        dedupeKey: executionDedupeKey,
        status: 'RUNNING',
        triggerPayload: event as any,
      },
      update: {},
    });

    if (claimed.status !== 'RUNNING' || claimed.finishedAt) {
      results.push({ automationId: automation.id, deduplicated: true });
      continue;
    }

    try {
      const effects = [];
      for (const action of normalizeActions(automation.actions)) {
        effects.push(await executeAction(app, automation, event, action));
      }
      await app.prisma.$transaction([
        app.prisma.automationExecution.update({
          where: { id: claimed.id },
          data: { status: 'SUCCESS', actionResult: effects as any, finishedAt: new Date() },
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
