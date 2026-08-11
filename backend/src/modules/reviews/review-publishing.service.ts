import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { loadIntegrationCredentialsFromPrisma } from '../integrations/providers/credential-vault.js';
import { ProviderAdapterError } from '../integrations/providers/provider.errors.js';
import { providerRegistry } from '../integrations/providers/provider.registry.js';
import type { ProviderConnectionContext } from '../integrations/providers/provider.types.js';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function providerReference(reviewMetadata: unknown): string {
  const metadata = object(reviewMetadata);
  const provider = object(metadata.provider);
  const raw = object(provider.raw);
  return typeof raw.providerReviewName === 'string' ? raw.providerReviewName : '';
}

async function loadPublishingContext(prisma: PrismaClient, organizationId: string, reviewId: string, replyId: string) {
  const reply = await prisma.reviewReply.findFirst({
    where: { id: replyId, organizationId, reviewId },
    include: {
      review: {
        include: { source: true },
      },
    },
  });
  if (!reply) throw new AppError({ code: 'REVIEW_REPLY_NOT_FOUND', message: 'Ответ не найден', statusCode: 404 });
  const sourceMetadata = object(reply.review.source.metadata);
  const accountId = typeof sourceMetadata.integrationAccountId === 'string' ? sourceMetadata.integrationAccountId : '';
  if (!accountId) {
    throw new AppError({ code: 'REVIEW_PROVIDER_ACCOUNT_MISSING', message: 'Для источника отзыва не найдено подключение провайдера', statusCode: 422 });
  }
  const account = await prisma.integrationAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new AppError({ code: 'INTEGRATION_ACCOUNT_NOT_FOUND', message: 'Подключение провайдера не найдено', statusCode: 404 });
  if (!['CONNECTED', 'DEGRADED'].includes(account.status)) {
    throw new AppError({ code: 'INTEGRATION_NOT_CONNECTED', message: 'Интеграция не готова к публикации ответа', statusCode: 409 });
  }
  const adapter = providerRegistry.get(account.provider);
  const availability = adapter?.availability();
  if (!adapter || !availability?.configured || !availability.connectable || !adapter.capabilities.includes('reviews.reply') || !adapter.publishReply) {
    throw new AppError({
      code: availability?.reasonCode || 'PROVIDER_REPLY_NOT_SUPPORTED',
      message: availability?.reasonMessage || 'Публикация ответов через этот источник пока не поддерживается',
      statusCode: 422,
    });
  }
  const reviewReference = providerReference(reply.review.metadata);
  if (!reviewReference) {
    throw new AppError({ code: 'PROVIDER_REVIEW_REFERENCE_MISSING', message: 'Не найден внешний идентификатор отзыва для публикации', statusCode: 422 });
  }
  const context: ProviderConnectionContext = {
    organizationId,
    accountId: account.id,
    provider: account.provider,
    externalAccountId: account.externalAccountId,
    configuration: object(account.configuration),
    credentials: await loadIntegrationCredentialsFromPrisma(prisma, organizationId, account.id),
  };
  return { reply, adapter, context, reviewReference };
}

export async function enqueueReplyPublication(
  prisma: PrismaClient,
  input: { organizationId: string; reviewId: string; replyId: string; actorUserId?: string | null; trigger: 'manual' | 'autopilot' },
) {
  const loaded = await loadPublishingContext(prisma, input.organizationId, input.reviewId, input.replyId);
  if (!['READY_TO_PUBLISH', 'PUBLISH_FAILED'].includes(loaded.reply.status)) {
    throw new AppError({ code: 'REVIEW_REPLY_INVALID_TRANSITION', message: 'Ответ ещё не готов к публикации', statusCode: 409 });
  }
  const latest = await prisma.reviewReply.findFirst({
    where: { organizationId: input.organizationId, reviewId: input.reviewId },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });
  if (!latest || latest.id !== input.replyId) {
    throw new AppError({ code: 'REVIEW_REPLY_STALE_VERSION', message: 'Нельзя публиковать устаревшую версию ответа', statusCode: 409 });
  }

  const nextRetryCount = loaded.reply.status === 'PUBLISH_FAILED' ? loaded.reply.retryCount + 1 : loaded.reply.retryCount;
  const dedupeKey = `provider:reply:${loaded.reply.id}:${loaded.reply.version}:${nextRetryCount}`;
  try {
    return await prisma.$transaction(async (tx) => {
      await tx.reviewReply.update({
        where: { id: loaded.reply.id },
        data: {
          status: 'PUBLISH_QUEUED',
          publishRequestedAt: new Date(),
          failedReason: null,
          retryCount: nextRetryCount,
        },
      });
      const job = await tx.job.create({
        data: {
          organizationId: input.organizationId,
          type: 'provider.publishReply',
          payload: { organizationId: input.organizationId, reviewId: input.reviewId, replyId: input.replyId },
          dedupeKey,
          maxAttempts: 5,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId: input.organizationId,
          actorUserId: input.actorUserId ?? null,
          action: input.trigger === 'autopilot' ? 'review.reply.autopilot_publish_queued' : 'review.reply.publish_requested',
          entityType: 'reviewReply',
          entityId: input.replyId,
          metadata: { reviewId: input.reviewId, jobId: job.id, trigger: input.trigger },
        },
      });
      return { ok: true, jobId: job.id, status: 'PUBLISH_QUEUED' as const };
    });
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && String((error as { code?: unknown }).code) === 'P2002') {
      const existing = await prisma.job.findFirst({ where: { organizationId: input.organizationId, dedupeKey }, select: { id: true, status: true } });
      if (existing) return { ok: true, jobId: existing.id, status: 'PUBLISH_QUEUED' as const };
    }
    throw error;
  }
}

async function markPublished(
  prisma: PrismaClient,
  input: { organizationId: string; reviewId: string; replyId: string; providerReplyId?: string | null; providerState?: string | null; providerPolicyViolation?: unknown },
) {
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.reviewReply.update({
      where: { id: input.replyId },
      data: {
        status: 'PUBLISHED',
        providerReplyId: input.providerReplyId ?? null,
        providerState: input.providerState ?? null,
        ...(input.providerPolicyViolation !== undefined ? { providerPolicyViolation: JSON.parse(JSON.stringify(input.providerPolicyViolation)) as Prisma.InputJsonValue } : {}),
        publishedAt: now,
        lastReconciledAt: now,
        failedReason: null,
      },
    });
    await tx.review.update({ where: { id: input.reviewId }, data: { status: 'DONE', workflowStatus: 'PUBLISHED', repliedAt: now } });
    await tx.auditLog.create({
      data: {
        organizationId: input.organizationId,
        actorUserId: null,
        action: 'review.reply.published',
        entityType: 'reviewReply',
        entityId: input.replyId,
        metadata: { reviewId: input.reviewId, providerState: input.providerState ?? null },
      },
    });
  });
}

export async function processReplyPublishJob(
  prisma: PrismaClient,
  input: { organizationId: string; reviewId: string; replyId: string },
) {
  const loaded = await loadPublishingContext(prisma, input.organizationId, input.reviewId, input.replyId);
  if (loaded.reply.status === 'PUBLISHED') return;
  if (!['PUBLISH_QUEUED', 'PUBLISHING'].includes(loaded.reply.status)) {
    throw new ProviderAdapterError({ code: 'REPLY_PUBLISH_STATE_INVALID', message: 'Reply is not queued for publishing', retryable: false });
  }
  await prisma.reviewReply.update({ where: { id: input.replyId }, data: { status: 'PUBLISHING' } });

  try {
    const result = await loaded.adapter.publishReply!(loaded.context, {
      reviewReference: loaded.reviewReference,
      text: loaded.reply.text,
    });
    if (result.status === 'CONFIRMED') {
      await markPublished(prisma, {
        ...input,
        providerReplyId: result.externalReplyId ?? `${loaded.reviewReference}/reply`,
        providerState: result.providerState ?? null,
        providerPolicyViolation: result.policyViolation,
      });
      return;
    }

    const runAt = new Date(Date.now() + 5_000);
    await prisma.$transaction(async (tx) => {
      const updated = await tx.reviewReply.update({
        where: { id: input.replyId },
        data: { status: 'PUBLISH_UNKNOWN', failedReason: 'PROVIDER_REPLY_OUTCOME_UNKNOWN', retryCount: { increment: 1 } },
      });
      await tx.job.create({
        data: {
          organizationId: input.organizationId,
          type: 'provider.reconcileReply',
          payload: input,
          dedupeKey: `provider:reply-reconcile:${input.replyId}:${updated.retryCount}`,
          runAt,
          maxAttempts: 5,
        },
      });
    });
  } catch (error) {
    if (error instanceof ProviderAdapterError && error.retryable) {
      await prisma.reviewReply.update({ where: { id: input.replyId }, data: { status: 'PUBLISH_QUEUED', failedReason: error.code, retryCount: { increment: 1 } } });
      throw error;
    }
    const message = error instanceof ProviderAdapterError ? error.code : error instanceof Error ? error.message : 'PROVIDER_REPLY_FAILED';
    await prisma.reviewReply.update({ where: { id: input.replyId }, data: { status: 'PUBLISH_FAILED', failedReason: message.slice(0, 1000), retryCount: { increment: 1 } } });
  }
}

export async function processReplyReconciliationJob(
  prisma: PrismaClient,
  input: { organizationId: string; reviewId: string; replyId: string },
) {
  const loaded = await loadPublishingContext(prisma, input.organizationId, input.reviewId, input.replyId);
  if (loaded.reply.status === 'PUBLISHED') return;
  if (loaded.reply.status !== 'PUBLISH_UNKNOWN') {
    throw new ProviderAdapterError({ code: 'REPLY_RECONCILE_STATE_INVALID', message: 'Reply is not awaiting reconciliation', retryable: false });
  }
  if (!loaded.adapter.reconcileReply) {
    await prisma.reviewReply.update({ where: { id: input.replyId }, data: { status: 'PUBLISH_FAILED', failedReason: 'PROVIDER_RECONCILIATION_NOT_SUPPORTED', lastReconciledAt: new Date() } });
    return;
  }

  const result = await loaded.adapter.reconcileReply(loaded.context, {
    reviewReference: loaded.reviewReference,
    text: loaded.reply.text,
  });
  if (result.status === 'CONFIRMED') {
    await markPublished(prisma, {
      ...input,
      providerReplyId: result.externalReplyId ?? `${loaded.reviewReference}/reply`,
      providerState: result.providerState ?? null,
      providerPolicyViolation: result.policyViolation,
    });
    return;
  }
  if (result.status === 'ABSENT') {
    await prisma.reviewReply.update({
      where: { id: input.replyId },
      data: { status: 'PUBLISH_FAILED', failedReason: 'PROVIDER_REPLY_NOT_FOUND_AFTER_RECONCILIATION', lastReconciledAt: new Date() },
    });
    return;
  }
  throw new ProviderAdapterError({ code: 'PROVIDER_RECONCILIATION_INCONCLUSIVE', message: 'Provider reply state is still unknown', retryable: true });
}
