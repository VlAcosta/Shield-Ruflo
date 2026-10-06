import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { z } from 'zod';
import { AppError } from '../../core/errors/app-error.js';
import { assertEntitlement } from '../billing/billing.service.js';
import { dispatchAutomationEvent } from './automation-engine.js';

const automationIdParams = z.object({ automationId: z.string().uuid() });
const jsonObjectSchema = z.record(z.string(), z.unknown());
const automationActionSchema = z.union([
  z.string().trim().min(1).max(120),
  z.object({ type: z.string().trim().min(1).max(120), config: jsonObjectSchema.default({}) }),
]);
const automationSchema = z.object({
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(500).optional(),
  trigger: z.string().trim().min(1).max(120),
  conditions: jsonObjectSchema.default({}),
  actions: z.array(automationActionSchema).min(1).max(10),
  enabled: z.boolean().default(true),
});
const automationPatchSchema = automationSchema.partial();
const AUTOMATION_DESCRIPTION_KEY = '__description';

function authContext(request: FastifyRequest) {
  if (!request.auth?.organizationId) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  return { organizationId: request.auth.organizationId, userId: request.auth.userId };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function automationConditions(conditions: Record<string, unknown>, description?: string) {
  const value = { ...conditions };
  if (description !== undefined) {
    if (description) value[AUTOMATION_DESCRIPTION_KEY] = description;
    else delete value[AUTOMATION_DESCRIPTION_KEY];
  }
  return value;
}

export const operationsRoutes: FastifyPluginAsync = async (app) => {
  app.get('/automations', { preHandler: [app.authenticate, app.authorize('automations.view')] }, async (request) => {
    const { organizationId } = authContext(request);
    const automations = await app.prisma.automation.findMany({
      where: { organizationId },
      include: { executions: { orderBy: { startedAt: 'desc' }, take: 10 } },
      orderBy: { createdAt: 'desc' },
    });
    return { automations };
  });

  app.post('/automations', { preHandler: [app.authenticate, app.authorize('automations.manage')] }, async (request, reply) => {
    const { organizationId, userId } = authContext(request);
    await assertEntitlement(app, organizationId, 'automations');
    const body = automationSchema.parse(request.body);
    const automation = await app.prisma.automation.create({
      data: {
        organizationId,
        name: body.name,
        trigger: body.trigger,
        conditions: toJson(automationConditions(body.conditions, body.description)),
        actions: toJson(body.actions),
        enabled: body.enabled,
      },
    });
    await app.prisma.auditLog.create({
      data: { organizationId, actorUserId: userId, action: 'automation.created', entityType: 'Automation', entityId: automation.id },
    });
    return reply.code(201).send({ automation });
  });

  app.patch('/automations/:automationId', { preHandler: [app.authenticate, app.authorize('automations.manage')] }, async (request) => {
    const { organizationId, userId } = authContext(request);
    await assertEntitlement(app, organizationId, 'automations');
    const { automationId } = automationIdParams.parse(request.params);
    const current = await app.prisma.automation.findFirst({
      where: { id: automationId, organizationId },
      select: { id: true, conditions: true },
    });
    if (!current) throw new AppError({ code: 'AUTOMATION_NOT_FOUND', message: 'Автоматизация не найдена', statusCode: 404 });
    const body = automationPatchSchema.parse(request.body);
    const shouldUpdateConditions = body.conditions !== undefined || body.description !== undefined;
    const nextConditions = automationConditions(
      body.conditions !== undefined ? body.conditions : asRecord(current.conditions),
      body.description,
    );
    const data: Prisma.AutomationUpdateInput = {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.trigger !== undefined ? { trigger: body.trigger } : {}),
      ...(shouldUpdateConditions ? { conditions: toJson(nextConditions) } : {}),
      ...(body.actions !== undefined ? { actions: toJson(body.actions) } : {}),
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    };
    const automation = await app.prisma.automation.update({ where: { id: current.id }, data });
    await app.prisma.auditLog.create({
      data: { organizationId, actorUserId: userId, action: 'automation.updated', entityType: 'Automation', entityId: automation.id },
    });
    return { automation };
  });

  app.delete('/automations/:automationId', { preHandler: [app.authenticate, app.authorize('automations.manage')] }, async (request, reply) => {
    const { organizationId, userId } = authContext(request);
    const { automationId } = automationIdParams.parse(request.params);
    const current = await app.prisma.automation.findFirst({ where: { id: automationId, organizationId }, select: { id: true, name: true } });
    if (!current) throw new AppError({ code: 'AUTOMATION_NOT_FOUND', message: 'Автоматизация не найдена', statusCode: 404 });
    await app.prisma.$transaction([
      app.prisma.automation.delete({ where: { id: current.id } }),
      app.prisma.auditLog.create({
        data: { organizationId, actorUserId: userId, action: 'automation.deleted', entityType: 'Automation', entityId: current.id, metadata: { name: current.name } },
      }),
    ]);
    return reply.code(204).send();
  });

  app.post('/automations/run', { preHandler: [app.authenticate, app.authorize('automations.manage')] }, async (request) => {
    const { organizationId, userId } = authContext(request);
    await assertEntitlement(app, organizationId, 'automations');
    const reviews = await app.prisma.review.findMany({
      where: { organizationId, status: { not: 'ARCHIVED' } },
      select: {
        id: true,
        rating: true,
        businessId: true,
        locationId: true,
        externalId: true,
        sourceId: true,
        author: { select: { name: true } },
        source: { select: { provider: true } },
      },
      orderBy: { receivedAt: 'desc' },
      take: 250,
    });
    const runs: Array<Record<string, unknown>> = [];
    for (const review of reviews) {
      runs.push(...await dispatchAutomationEvent(app, {
        type: 'new_review',
        organizationId,
        actorUserId: userId,
        dedupeKey: `${review.sourceId}:${review.externalId}`,
        review: {
          id: review.id,
          rating: review.rating,
          businessId: review.businessId,
          locationId: review.locationId,
          author: review.author?.name ?? null,
          provider: review.source.provider,
        },
      }));
    }
    return { evaluated: reviews.length, runs };
  });


};
