import type { PrismaClient } from '../../generated/prisma/client.js';
import { decryptCredentialSecret } from '../../shared/security/credential-cipher.js';
import {
  fromDbWebhookEvent,
  postSignedWebhook,
  resolveSafeWebhookTarget,
  signWebhookPayload,
  type ResolvedWebhookTarget,
  type WebhookEventName,
  type WebhookHttpResult,
} from './webhook-security.js';
import { organizationHasWebhookEntitlement } from './webhook.service.js';

const RESPONSE_SNIPPET_LIMIT = 4_096;

export class WebhookDeliveryError extends Error {
  retryable: boolean;
  deliveryId: string;

  constructor(message: string, deliveryId: string, retryable: boolean) {
    super(message);
    this.name = 'WebhookDeliveryError';
    this.deliveryId = deliveryId;
    this.retryable = retryable;
  }
}

export type WebhookDeliveryTransport = (input: {
  target: ResolvedWebhookTarget;
  body: string;
  eventId: string;
  eventType: WebhookEventName;
  timestamp: number;
  attempt: number;
  signature: string;
}) => Promise<WebhookHttpResult>;

export type WebhookDeliveryResolver = Parameters<typeof resolveSafeWebhookTarget>[1];

function snippet(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, RESPONSE_SNIPPET_LIMIT);
}

function isRetryableHttpStatus(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

function isSuccessfulHttpStatus(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}

function targetFailureRetryable(error: unknown): boolean {
  const code = error instanceof Error ? error.message : String(error);
  return ![
    'WEBHOOK_URL_INVALID',
    'WEBHOOK_HTTPS_REQUIRED',
    'WEBHOOK_URL_CREDENTIALS_FORBIDDEN',
    'WEBHOOK_PRIVATE_TARGET_FORBIDDEN',
  ].includes(code);
}

async function recordAttempt(
  prisma: PrismaClient,
  input: {
    deliveryId: string;
    outcome: 'DELIVERED' | 'RETRYABLE_FAILURE' | 'NON_RETRYABLE_FAILURE';
    signatureTimestamp: number;
    responseStatus?: number | null;
    durationMs?: number | null;
    responseBodySnippet?: string | null;
    error?: string | null;
  },
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`webhook-attempt:${input.deliveryId}`}, 0))`;
    const current = await tx.webhookDelivery.findUnique({ where: { id: input.deliveryId } });
    if (!current) throw new Error('WEBHOOK_DELIVERY_NOT_FOUND');
    const attemptNumber = current.attempts + 1;
    const now = new Date();
    const delivered = input.outcome === 'DELIVERED';
    const nonRetryable = input.outcome === 'NON_RETRYABLE_FAILURE';

    await tx.webhookDeliveryAttempt.create({
      data: {
        deliveryId: input.deliveryId,
        attemptNumber,
        outcome: input.outcome,
        signatureTimestamp: input.signatureTimestamp,
        ...(input.responseStatus === undefined ? {} : { responseStatus: input.responseStatus }),
        ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
        ...(input.responseBodySnippet === undefined ? {} : { responseBodySnippet: snippet(input.responseBodySnippet) }),
        ...(input.error === undefined ? {} : { error: snippet(input.error) }),
      },
    });

    const updated = await tx.webhookDelivery.update({
      where: { id: input.deliveryId },
      data: {
        attempts: attemptNumber,
        status: delivered ? 'DELIVERED' : nonRetryable ? 'DEAD' : 'RETRYING',
        responseStatus: input.responseStatus ?? null,
        responseBodySnippet: snippet(input.responseBodySnippet),
        lastError: delivered ? null : snippet(input.error),
        deliveredAt: delivered ? now : null,
        deadAt: nonRetryable ? now : null,
        nextAttemptAt: delivered || nonRetryable ? null : current.nextAttemptAt,
      },
    });

    await tx.webhookEndpoint.update({
      where: { id: current.endpointId },
      data: {
        lastDeliveryAt: now,
        lastDeliveryStatus: updated.status,
      },
    });
    return { updated, attemptNumber };
  });
}

async function failBeforeRequest(
  prisma: PrismaClient,
  deliveryId: string,
  error: unknown,
  retryable: boolean,
): Promise<never> {
  const message = error instanceof Error ? error.message : String(error);
  await recordAttempt(prisma, {
    deliveryId,
    outcome: retryable ? 'RETRYABLE_FAILURE' : 'NON_RETRYABLE_FAILURE',
    signatureTimestamp: Math.floor(Date.now() / 1000),
    error: message,
  });
  throw new WebhookDeliveryError(message, deliveryId, retryable);
}

export async function processWebhookDeliveryJob(
  prisma: PrismaClient,
  input: { deliveryId: string },
  dependencies: {
    transport?: WebhookDeliveryTransport;
    resolver?: WebhookDeliveryResolver;
  } = {},
) {
  const delivery = await prisma.webhookDelivery.findUnique({
    where: { id: input.deliveryId },
    include: { endpoint: true },
  });
  if (!delivery) throw new WebhookDeliveryError('WEBHOOK_DELIVERY_NOT_FOUND', input.deliveryId, false);
  if (delivery.status === 'DELIVERED') return { deliveryId: delivery.id, delivered: true, idempotent: true };
  if (!['QUEUED', 'RETRYING'].includes(delivery.status)) {
    throw new WebhookDeliveryError('WEBHOOK_DELIVERY_NOT_RUNNABLE', delivery.id, false);
  }
  if (delivery.endpoint.status !== 'ACTIVE') {
    return failBeforeRequest(prisma, delivery.id, new Error('WEBHOOK_ENDPOINT_INACTIVE'), false);
  }
  if (!(await organizationHasWebhookEntitlement(prisma, delivery.organizationId))) {
    return failBeforeRequest(prisma, delivery.id, new Error('WEBHOOK_ENTITLEMENT_REQUIRED'), false);
  }

  let secret: string;
  try {
    secret = decryptCredentialSecret(delivery.endpoint.secretEncrypted);
  } catch (error) {
    return failBeforeRequest(prisma, delivery.id, error, false);
  }

  let target: ResolvedWebhookTarget;
  try {
    target = await resolveSafeWebhookTarget(delivery.endpoint.url, dependencies.resolver);
  } catch (error) {
    return failBeforeRequest(prisma, delivery.id, error, targetFailureRetryable(error));
  }

  const eventType = fromDbWebhookEvent(delivery.eventType);
  const timestamp = Math.floor(Date.now() / 1000);
  const attempt = delivery.attempts + 1;
  const signature = signWebhookPayload(secret, timestamp, delivery.requestBody);
  const transport = dependencies.transport ?? postSignedWebhook;

  let response: WebhookHttpResult;
  try {
    response = await transport({
      target,
      body: delivery.requestBody,
      eventId: delivery.eventId,
      eventType,
      timestamp,
      attempt,
      signature,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordAttempt(prisma, {
      deliveryId: delivery.id,
      outcome: 'RETRYABLE_FAILURE',
      signatureTimestamp: timestamp,
      error: message,
    });
    throw new WebhookDeliveryError(message, delivery.id, true);
  }

  if (isSuccessfulHttpStatus(response.statusCode)) {
    const result = await recordAttempt(prisma, {
      deliveryId: delivery.id,
      outcome: 'DELIVERED',
      signatureTimestamp: timestamp,
      responseStatus: response.statusCode,
      durationMs: response.durationMs,
      responseBodySnippet: response.body,
    });
    return { deliveryId: delivery.id, delivered: true, attemptNumber: result.attemptNumber };
  }

  const retryable = isRetryableHttpStatus(response.statusCode);
  await recordAttempt(prisma, {
    deliveryId: delivery.id,
    outcome: retryable ? 'RETRYABLE_FAILURE' : 'NON_RETRYABLE_FAILURE',
    signatureTimestamp: timestamp,
    responseStatus: response.statusCode,
    durationMs: response.durationMs,
    responseBodySnippet: response.body,
    error: `WEBHOOK_HTTP_${response.statusCode}`,
  });
  throw new WebhookDeliveryError(`WEBHOOK_HTTP_${response.statusCode}`, delivery.id, retryable);
}

export async function syncWebhookDeliveryJobFailure(
  prisma: PrismaClient,
  input: {
    deliveryId: string;
    retryable: boolean;
    exhausted: boolean;
    nextRunAt: Date | null;
    error: string;
  },
) {
  const dead = !input.retryable || input.exhausted;
  const now = new Date();
  await prisma.webhookDelivery.updateMany({
    where: { id: input.deliveryId, status: { in: ['QUEUED', 'RETRYING', 'DEAD'] } },
    data: {
      status: dead ? 'DEAD' : 'RETRYING',
      deadAt: dead ? now : null,
      nextAttemptAt: dead ? null : input.nextRunAt,
      lastError: snippet(input.error),
    },
  });
}
