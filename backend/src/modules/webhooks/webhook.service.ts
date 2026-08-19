import crypto from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { assertEntitlement } from '../billing/billing.service.js';
import { encryptCredentialSecret } from '../../shared/security/credential-cipher.js';
import {
  WEBHOOK_EVENT_TYPES,
  createWebhookSecret,
  fromDbWebhookEvent,
  toDbWebhookEvent,
  validateWebhookUrlShape,
  webhookSecretHint,
  type WebhookEventName,
} from './webhook-security.js';

const ACTIVE_SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'INCOMPLETE'] as const;
const WEBHOOK_MAX_ATTEMPTS = 8;

function auditContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
  };
}

function directHumanContext(request: FastifyRequest) {
  const auth = request.auth;
  if (!auth?.organizationId || !auth.userId || auth.accessMode !== 'DIRECT') {
    throw new AppError({
      code: 'WEBHOOK_HUMAN_CONTEXT_REQUIRED',
      message: 'Управлять webhook можно только из прямого пользовательского рабочего пространства',
      statusCode: 403,
    });
  }
  return { organizationId: auth.organizationId, userId: auth.userId };
}

function safeWebhookUrl(rawUrl: string): string {
  try {
    return validateWebhookUrlShape(rawUrl).toString();
  } catch (error) {
    const code = error instanceof Error ? error.message : 'WEBHOOK_URL_INVALID';
    const message = code === 'WEBHOOK_HTTPS_REQUIRED'
      ? 'Webhook URL должен использовать HTTPS'
      : code === 'WEBHOOK_PRIVATE_TARGET_FORBIDDEN'
        ? 'Webhook URL не может указывать на private/loopback адрес'
        : code === 'WEBHOOK_URL_CREDENTIALS_FORBIDDEN'
          ? 'Webhook URL не должен содержать credentials'
          : 'Webhook URL некорректен';
    throw new AppError({ code, message, statusCode: 400 });
  }
}

function endpointView(endpoint: {
  id: string;
  name: string;
  url: string;
  status: string;
  events: readonly string[];
  secretHint: string;
  secretVersion: number;
  pausedAt: Date | null;
  revokedAt: Date | null;
  lastDeliveryAt: Date | null;
  lastDeliveryStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: endpoint.id,
    name: endpoint.name,
    url: endpoint.url,
    status: endpoint.status.toLowerCase(),
    events: endpoint.events.map(fromDbWebhookEvent),
    secretHint: endpoint.secretHint,
    secretVersion: endpoint.secretVersion,
    pausedAt: endpoint.pausedAt?.toISOString() ?? null,
    revokedAt: endpoint.revokedAt?.toISOString() ?? null,
    lastDeliveryAt: endpoint.lastDeliveryAt?.toISOString() ?? null,
    lastDeliveryStatus: endpoint.lastDeliveryStatus?.toLowerCase() ?? null,
    createdAt: endpoint.createdAt.toISOString(),
    updatedAt: endpoint.updatedAt.toISOString(),
  };
}

function deliveryView(delivery: {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: string;
  eventVersion: number;
  status: string;
  attempts: number;
  maxAttempts: number;
  responseStatus: number | null;
  responseBodySnippet: string | null;
  lastError: string | null;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  deadAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: delivery.id,
    endpointId: delivery.endpointId,
    eventId: delivery.eventId,
    eventType: fromDbWebhookEvent(delivery.eventType),
    eventVersion: delivery.eventVersion,
    status: delivery.status.toLowerCase(),
    attempts: delivery.attempts,
    maxAttempts: delivery.maxAttempts,
    responseStatus: delivery.responseStatus,
    responseBodySnippet: delivery.responseBodySnippet,
    lastError: delivery.lastError,
    nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
    deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
    deadAt: delivery.deadAt?.toISOString() ?? null,
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}

export async function organizationHasWebhookEntitlement(prisma: PrismaClient, organizationId: string): Promise<boolean> {
  const subscription = await prisma.subscription.findFirst({
    where: { organizationId, status: { in: [...ACTIVE_SUBSCRIPTION_STATUSES] } },
    include: { plan: { include: { entitlements: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!subscription) return false;
  if (subscription.status === 'TRIALING' && subscription.currentPeriodEnd && subscription.currentPeriodEnd <= new Date()) return false;
  return subscription.plan.entitlements.some((item) => item.key === 'api_webhooks' && item.value === true);
}

async function requireEndpoint(app: FastifyInstance, organizationId: string, endpointId: string) {
  const endpoint = await app.prisma.webhookEndpoint.findFirst({ where: { id: endpointId, organizationId } });
  if (!endpoint) throw new AppError({ code: 'WEBHOOK_ENDPOINT_NOT_FOUND', message: 'Webhook endpoint не найден', statusCode: 404 });
  return endpoint;
}

export async function listWebhookEndpoints(app: FastifyInstance, request: FastifyRequest) {
  const { organizationId } = directHumanContext(request);
  await assertEntitlement(app, organizationId, 'api_webhooks');
  const endpoints = await app.prisma.webhookEndpoint.findMany({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
  return { items: endpoints.map(endpointView), eventTypes: [...WEBHOOK_EVENT_TYPES] };
}

export async function createWebhookEndpoint(
  app: FastifyInstance,
  request: FastifyRequest,
  input: { name: string; url: string; events: WebhookEventName[] },
) {
  const { organizationId, userId } = directHumanContext(request);
  await assertEntitlement(app, organizationId, 'api_webhooks');
  const url = safeWebhookUrl(input.url);
  const secret = createWebhookSecret();
  const encrypted = encryptCredentialSecret(secret);
  const hint = webhookSecretHint(secret);
  const dbEvents = input.events.map(toDbWebhookEvent);

  const endpoint = await app.prisma.$transaction(async (tx) => {
    const created = await tx.webhookEndpoint.create({
      data: {
        organizationId,
        name: input.name,
        url,
        events: dbEvents,
        secretEncrypted: encrypted,
        secretHint: hint,
        createdByUserId: userId,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'webhook.endpoint.created',
        entityType: 'webhook_endpoint',
        entityId: created.id,
        metadata: { url, events: input.events, secretVersion: 1 },
        ...auditContext(request),
      },
    });
    return created;
  });

  return { endpoint: endpointView(endpoint), signingSecret: secret };
}

export async function updateWebhookEndpoint(
  app: FastifyInstance,
  request: FastifyRequest,
  endpointId: string,
  input: { name?: string; url?: string; events?: WebhookEventName[]; status?: 'active' | 'paused' },
) {
  const { organizationId, userId } = directHumanContext(request);
  await assertEntitlement(app, organizationId, 'api_webhooks');
  const existing = await requireEndpoint(app, organizationId, endpointId);
  if (existing.status === 'REVOKED') {
    throw new AppError({ code: 'WEBHOOK_ENDPOINT_REVOKED', message: 'Webhook endpoint отозван', statusCode: 409 });
  }
  const nextUrl = input.url === undefined ? existing.url : safeWebhookUrl(input.url);
  const nextStatus = input.status === undefined ? existing.status : input.status.toUpperCase();
  const now = new Date();

  const updated = await app.prisma.$transaction(async (tx) => {
    const row = await tx.webhookEndpoint.update({
      where: { id: endpointId },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.url === undefined ? {} : { url: nextUrl }),
        ...(input.events === undefined ? {} : { events: input.events.map(toDbWebhookEvent) }),
        ...(input.status === undefined ? {} : {
          status: nextStatus as 'ACTIVE' | 'PAUSED',
          pausedAt: nextStatus === 'PAUSED' ? now : null,
        }),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'webhook.endpoint.updated',
        entityType: 'webhook_endpoint',
        entityId: endpointId,
        metadata: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.url === undefined ? {} : { url: nextUrl }),
          ...(input.events === undefined ? {} : { events: input.events }),
          ...(input.status === undefined ? {} : { status: input.status }),
        },
        ...auditContext(request),
      },
    });
    return row;
  });
  return { endpoint: endpointView(updated) };
}

export async function rotateWebhookSecret(app: FastifyInstance, request: FastifyRequest, endpointId: string) {
  const { organizationId, userId } = directHumanContext(request);
  await assertEntitlement(app, organizationId, 'api_webhooks');
  const existing = await requireEndpoint(app, organizationId, endpointId);
  if (existing.status === 'REVOKED') throw new AppError({ code: 'WEBHOOK_ENDPOINT_REVOKED', message: 'Webhook endpoint отозван', statusCode: 409 });
  const secret = createWebhookSecret();
  const hint = webhookSecretHint(secret);

  const endpoint = await app.prisma.$transaction(async (tx) => {
    const updated = await tx.webhookEndpoint.update({
      where: { id: endpointId },
      data: {
        secretEncrypted: encryptCredentialSecret(secret),
        secretHint: hint,
        secretVersion: { increment: 1 },
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'webhook.secret.rotated',
        entityType: 'webhook_endpoint',
        entityId: endpointId,
        metadata: { secretVersion: updated.secretVersion },
        ...auditContext(request),
      },
    });
    return updated;
  });
  return { endpoint: endpointView(endpoint), signingSecret: secret };
}

export async function revokeWebhookEndpoint(app: FastifyInstance, request: FastifyRequest, endpointId: string) {
  const { organizationId, userId } = directHumanContext(request);
  await assertEntitlement(app, organizationId, 'api_webhooks');
  const existing = await requireEndpoint(app, organizationId, endpointId);
  if (existing.status === 'REVOKED') return { endpoint: endpointView(existing) };
  const now = new Date();

  const endpoint = await app.prisma.$transaction(async (tx) => {
    const updated = await tx.webhookEndpoint.update({
      where: { id: endpointId },
      data: { status: 'REVOKED', revokedAt: now, pausedAt: null },
    });
    await tx.job.updateMany({
      where: {
        organizationId,
        type: 'webhook.deliver',
        status: 'QUEUED',
        payload: { path: ['endpointId'], equals: endpointId },
      },
      data: { status: 'DEAD', completedAt: now, lastError: 'WEBHOOK_ENDPOINT_REVOKED' },
    });
    await tx.webhookDelivery.updateMany({
      where: { endpointId, organizationId, status: { in: ['QUEUED', 'RETRYING'] } },
      data: { status: 'DEAD', deadAt: now, nextAttemptAt: null, lastError: 'WEBHOOK_ENDPOINT_REVOKED' },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'webhook.endpoint.revoked',
        entityType: 'webhook_endpoint',
        entityId: endpointId,
        metadata: {},
        ...auditContext(request),
      },
    });
    return updated;
  });
  return { endpoint: endpointView(endpoint) };
}

export async function listWebhookDeliveries(
  app: FastifyInstance,
  request: FastifyRequest,
  query: {
    endpointId?: string;
    status?: 'queued' | 'retrying' | 'delivered' | 'dead';
    eventType?: WebhookEventName;
    page: number;
    pageSize: number;
  },
) {
  const { organizationId } = directHumanContext(request);
  await assertEntitlement(app, organizationId, 'api_webhooks');
  const where: Prisma.WebhookDeliveryWhereInput = {
    organizationId,
    ...(query.endpointId ? { endpointId: query.endpointId } : {}),
    ...(query.status ? { status: query.status.toUpperCase() as 'QUEUED' | 'RETRYING' | 'DELIVERED' | 'DEAD' } : {}),
    ...(query.eventType ? { eventType: toDbWebhookEvent(query.eventType) } : {}),
  };
  const skip = (query.page - 1) * query.pageSize;
  const [total, rows] = await app.prisma.$transaction([
    app.prisma.webhookDelivery.count({ where }),
    app.prisma.webhookDelivery.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: query.pageSize }),
  ]);
  return {
    items: rows.map(deliveryView),
    pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.max(1, Math.ceil(total / query.pageSize)) },
  };
}

export async function getWebhookDelivery(app: FastifyInstance, request: FastifyRequest, deliveryId: string) {
  const { organizationId } = directHumanContext(request);
  await assertEntitlement(app, organizationId, 'api_webhooks');
  const delivery = await app.prisma.webhookDelivery.findFirst({
    where: { id: deliveryId, organizationId },
    include: { attemptHistory: { orderBy: { attemptNumber: 'asc' } } },
  });
  if (!delivery) throw new AppError({ code: 'WEBHOOK_DELIVERY_NOT_FOUND', message: 'Webhook delivery не найдена', statusCode: 404 });
  return {
    delivery: deliveryView(delivery),
    attempts: delivery.attemptHistory.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      outcome: attempt.outcome.toLowerCase(),
      signatureTimestamp: attempt.signatureTimestamp,
      responseStatus: attempt.responseStatus,
      durationMs: attempt.durationMs,
      responseBodySnippet: attempt.responseBodySnippet,
      error: attempt.error,
      createdAt: attempt.createdAt.toISOString(),
    })),
  };
}

export async function retryWebhookDelivery(app: FastifyInstance, request: FastifyRequest, deliveryId: string) {
  const { organizationId, userId } = directHumanContext(request);
  await assertEntitlement(app, organizationId, 'api_webhooks');
  const now = new Date();

  const result = await app.prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook-retry:${deliveryId}`}, 0))`;
    const delivery = await tx.webhookDelivery.findFirst({
      where: { id: deliveryId, organizationId },
      include: { endpoint: true },
    });
    if (!delivery) throw new AppError({ code: 'WEBHOOK_DELIVERY_NOT_FOUND', message: 'Webhook delivery не найдена', statusCode: 404 });
    if (delivery.status !== 'DEAD') {
      throw new AppError({ code: 'WEBHOOK_DELIVERY_NOT_DEAD', message: 'Повторный запуск доступен только для DEAD delivery', statusCode: 409 });
    }
    if (delivery.endpoint.status !== 'ACTIVE') {
      throw new AppError({ code: 'WEBHOOK_ENDPOINT_INACTIVE', message: 'Webhook endpoint неактивен', statusCode: 409 });
    }
    const updated = await tx.webhookDelivery.update({
      where: { id: delivery.id },
      data: { status: 'QUEUED', deadAt: null, nextAttemptAt: now, lastError: null },
    });
    await tx.job.create({
      data: {
        organizationId,
        type: 'webhook.deliver',
        payload: { deliveryId: delivery.id, endpointId: delivery.endpointId },
        dedupeKey: `webhook-retry:${delivery.id}:${crypto.randomUUID()}`,
        maxAttempts: delivery.maxAttempts,
        runAt: now,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: userId,
        action: 'webhook.delivery.retried',
        entityType: 'webhook_delivery',
        entityId: delivery.id,
        metadata: { endpointId: delivery.endpointId, priorAttempts: delivery.attempts },
        ...auditContext(request),
      },
    });
    return updated;
  });
  return { delivery: deliveryView(result) };
}

export async function enqueueWebhookEvent(
  prisma: PrismaClient,
  input: {
    organizationId: string;
    eventType: WebhookEventName;
    data: Prisma.InputJsonValue;
    occurredAt?: Date;
  },
) {
  if (!(await organizationHasWebhookEntitlement(prisma, input.organizationId))) {
    return { eventId: null, deliveries: 0 };
  }
  const dbEvent = toDbWebhookEvent(input.eventType);
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { organizationId: input.organizationId, status: 'ACTIVE', events: { has: dbEvent } },
    select: { id: true },
  });
  if (!endpoints.length) return { eventId: null, deliveries: 0 };

  const eventId = crypto.randomUUID();
  const envelope = {
    id: eventId,
    type: input.eventType,
    version: 1,
    createdAt: (input.occurredAt ?? new Date()).toISOString(),
    organizationId: input.organizationId,
    data: input.data,
  };
  const requestBody = JSON.stringify(envelope);

  await prisma.$transaction(async (tx) => {
    for (const endpoint of endpoints) {
      const delivery = await tx.webhookDelivery.create({
        data: {
          organizationId: input.organizationId,
          endpointId: endpoint.id,
          eventId,
          eventType: dbEvent,
          eventVersion: 1,
          payload: envelope as unknown as Prisma.InputJsonValue,
          requestBody,
          maxAttempts: WEBHOOK_MAX_ATTEMPTS,
          nextAttemptAt: new Date(),
        },
      });
      await tx.job.create({
        data: {
          organizationId: input.organizationId,
          type: 'webhook.deliver',
          payload: { deliveryId: delivery.id, endpointId: endpoint.id },
          dedupeKey: `webhook:${endpoint.id}:${eventId}`,
          maxAttempts: WEBHOOK_MAX_ATTEMPTS,
        },
      });
    }
  });
  return { eventId, deliveries: endpoints.length };
}
