import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { env } from '../../config/env.js';

export type ProductSuggestionInput = {
  category: string;
  subject: string;
  message: string;
  name?: string;
  email?: string;
};

export function suggestionDeliveryEventId(suggestionId: string): string {
  return `bs-feedback-${suggestionId}`;
}

export async function createProductSuggestion(
  app: FastifyInstance,
  actor: { organizationId: string; userId: string },
  input: ProductSuggestionInput,
) {
  const user = await app.prisma.user.findUnique({
    where: { id: actor.userId },
    select: { displayName: true, firstName: true, lastName: true, email: true },
  });
  const inferredName = user?.displayName
    || `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim()
    || undefined;
  const webhookConfigured = Boolean(env.SUGGESTION_WEBHOOK_URL);

  return app.prisma.$transaction(async (tx) => {
    const suggestion = await tx.productSuggestion.create({
      data: {
        organizationId: actor.organizationId,
        userId: actor.userId,
        category: input.category.slice(0, 120),
        subject: input.subject.slice(0, 240),
        message: input.message,
        contactName: (input.name || inferredName || '').slice(0, 180) || null,
        contactEmail: (input.email || user?.email || '').slice(0, 320) || null,
        deliveryStatus: webhookConfigured ? 'QUEUED' : 'STORED',
      },
    });

    if (webhookConfigured) {
      await tx.job.create({
        data: {
          organizationId: actor.organizationId,
          type: 'feedback.suggestion.deliver',
          payload: { suggestionId: suggestion.id },
          dedupeKey: `feedback-suggestion:${suggestion.id}`,
          maxAttempts: 5,
        },
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'product_suggestion.created',
        entityType: 'ProductSuggestion',
        entityId: suggestion.id,
        metadata: {
          category: suggestion.category,
          webhookQueued: webhookConfigured,
          hasContactEmail: Boolean(suggestion.contactEmail),
        },
      },
    });

    return suggestion;
  });
}

export async function processSuggestionDeliveryJob(
  prisma: PrismaClient,
  input: { suggestionId: string },
) {
  const suggestion = await prisma.productSuggestion.findUnique({ where: { id: input.suggestionId } });
  if (!suggestion) {
    const error = new Error('PRODUCT_SUGGESTION_NOT_FOUND') as Error & { retryable?: boolean };
    error.retryable = false;
    throw error;
  }

  // A duplicate durable job or a manual replay after a confirmed delivery is a
  // no-op. This is the local exactly-once boundary; remote retries use the same
  // stable event id so a webhook receiver can deduplicate as well.
  if (suggestion.deliveryStatus === 'DELIVERED') return;

  if (!env.SUGGESTION_WEBHOOK_URL) {
    await prisma.productSuggestion.update({
      where: { id: suggestion.id },
      data: { deliveryStatus: 'STORED', lastError: null },
    });
    return;
  }

  const eventId = suggestionDeliveryEventId(suggestion.id);
  let response: Response;
  try {
    response = await fetch(env.SUGGESTION_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': eventId,
        'X-Business-Shield-Event-Id': eventId,
        ...(env.SUGGESTION_WEBHOOK_TOKEN ? { Authorization: `Bearer ${env.SUGGESTION_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        eventId,
        id: suggestion.id,
        organizationId: suggestion.organizationId,
        category: suggestion.category,
        subject: suggestion.subject,
        message: suggestion.message,
        contactName: suggestion.contactName,
        contactEmail: suggestion.contactEmail,
        createdAt: suggestion.createdAt.toISOString(),
      }),
    });
  } catch {
    await prisma.productSuggestion.update({
      where: { id: suggestion.id },
      data: { deliveryStatus: 'RETRYING', lastError: 'WEBHOOK_NETWORK_FAILED' },
    });
    const error = new Error('SUGGESTION_WEBHOOK_NETWORK_FAILED') as Error & { retryable?: boolean };
    error.retryable = true;
    throw error;
  }

  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    await prisma.productSuggestion.update({
      where: { id: suggestion.id },
      data: { deliveryStatus: retryable ? 'RETRYING' : 'FAILED', lastError: `WEBHOOK_HTTP_${response.status}` },
    });
    const error = new Error(`SUGGESTION_WEBHOOK_HTTP_${response.status}`) as Error & { retryable?: boolean };
    error.retryable = retryable;
    throw error;
  }

  await prisma.productSuggestion.update({
    where: { id: suggestion.id },
    data: { deliveryStatus: 'DELIVERED', deliveredAt: new Date(), lastError: null },
  });
}
