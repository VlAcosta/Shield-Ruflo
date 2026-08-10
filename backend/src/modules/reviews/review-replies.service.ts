import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { presentReview, reviewInclude } from './reviews.service.js';

function auditContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
  };
}

async function requireTenantReview(app: FastifyInstance, organizationId: string, reviewId: string) {
  const review = await app.prisma.review.findFirst({ where: { id: reviewId, organizationId }, select: { id: true } });
  if (!review) throw new AppError({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден', statusCode: 404 });
}

async function requireTenantReply(app: FastifyInstance, organizationId: string, reviewId: string, replyId: string) {
  await requireTenantReview(app, organizationId, reviewId);
  const reply = await app.prisma.reviewReply.findFirst({ where: { id: replyId, organizationId, reviewId } });
  if (!reply) throw new AppError({ code: 'REVIEW_REPLY_NOT_FOUND', message: 'Ответ не найден', statusCode: 404 });
  return reply;
}

async function requireLatestReplyVersion(app: FastifyInstance, organizationId: string, reviewId: string, replyId: string) {
  const reply = await requireTenantReply(app, organizationId, reviewId, replyId);
  const latest = await app.prisma.reviewReply.findFirst({
    where: { organizationId, reviewId },
    orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, version: true },
  });
  if (!latest || latest.id !== reply.id) {
    throw new AppError({
      code: 'REVIEW_REPLY_STALE_VERSION',
      message: 'Нельзя согласовать устаревшую версию ответа',
      statusCode: 409,
    });
  }
  return reply;
}

async function loadPresentedReview(app: FastifyInstance, organizationId: string, reviewId: string) {
  const review = await app.prisma.review.findFirst({ where: { id: reviewId, organizationId }, include: reviewInclude });
  if (!review) throw new AppError({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден', statusCode: 404 });
  return presentReview(review);
}

export async function createVersionedDraft(
  app: FastifyInstance,
  request: FastifyRequest,
  reviewId: string,
  body: { text: string; publish: boolean },
) {
  const organizationId = request.auth!.organizationId!;
  await requireTenantReview(app, organizationId, reviewId);

  if (body.publish) {
    throw new AppError({
      code: 'REVIEW_PUBLISH_NOT_AVAILABLE',
      message: 'Публикация во внешнем источнике недоступна без production provider adapter',
      statusCode: 422,
    });
  }

  const createdReply = await app.prisma.$transaction(async (tx) => {
    const latest = await tx.reviewReply.findFirst({
      where: { organizationId, reviewId },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    const reply = await tx.reviewReply.create({
      data: {
        organizationId,
        reviewId,
        authorUserId: request.auth!.userId,
        text: body.text,
        status: 'DRAFT',
        version,
      },
    });
    await tx.review.update({
      where: { id: reviewId },
      data: { status: 'DEFERRED', workflowStatus: 'DRAFT' },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: 'review.reply.drafted',
        entityType: 'review',
        entityId: reviewId,
        metadata: { replyId: reply.id, version },
        ...auditContext(request),
      },
    });
    return reply;
  });

  return {
    ok: true,
    reply: createdReply,
    review: await loadPresentedReview(app, organizationId, reviewId),
  };
}

export async function submitReplyForApproval(
  app: FastifyInstance,
  request: FastifyRequest,
  reviewId: string,
  replyId: string,
) {
  const organizationId = request.auth!.organizationId!;
  const reply = await requireLatestReplyVersion(app, organizationId, reviewId, replyId);
  if (reply.status !== 'DRAFT') {
    throw new AppError({
      code: 'REVIEW_REPLY_INVALID_TRANSITION',
      message: 'На согласование можно отправить только черновик',
      statusCode: 409,
    });
  }

  const result = await app.prisma.$transaction(async (tx) => {
    const changed = await tx.reviewReply.updateMany({
      where: { id: reply.id, organizationId, reviewId, status: 'DRAFT' },
      data: { status: 'PENDING' },
    });
    if (changed.count !== 1) {
      throw new AppError({ code: 'REVIEW_REPLY_INVALID_TRANSITION', message: 'Статус ответа уже изменился', statusCode: 409 });
    }
    await tx.review.update({ where: { id: reviewId }, data: { workflowStatus: 'AWAITING_APPROVAL' } });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: 'review.reply.submitted_for_approval',
        entityType: 'reviewReply',
        entityId: reply.id,
        metadata: { reviewId, version: reply.version },
        ...auditContext(request),
      },
    });
    return tx.reviewReply.findUniqueOrThrow({ where: { id: reply.id } });
  });

  return { ok: true, reply: result, review: await loadPresentedReview(app, organizationId, reviewId) };
}

export async function approveReply(
  app: FastifyInstance,
  request: FastifyRequest,
  reviewId: string,
  replyId: string,
) {
  const organizationId = request.auth!.organizationId!;
  const reply = await requireLatestReplyVersion(app, organizationId, reviewId, replyId);
  if (reply.status !== 'PENDING') {
    throw new AppError({
      code: 'REVIEW_REPLY_INVALID_TRANSITION',
      message: 'Согласовать можно только ответ, ожидающий проверки',
      statusCode: 409,
    });
  }

  const result = await app.prisma.$transaction(async (tx) => {
    const changed = await tx.reviewReply.updateMany({
      where: { id: reply.id, organizationId, reviewId, status: 'PENDING' },
      data: { status: 'READY_TO_PUBLISH' },
    });
    if (changed.count !== 1) {
      throw new AppError({ code: 'REVIEW_REPLY_INVALID_TRANSITION', message: 'Статус ответа уже изменился', statusCode: 409 });
    }
    await tx.review.update({ where: { id: reviewId }, data: { workflowStatus: 'APPROVED' } });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: 'review.reply.approved',
        entityType: 'reviewReply',
        entityId: reply.id,
        metadata: { reviewId, version: reply.version },
        ...auditContext(request),
      },
    });
    return tx.reviewReply.findUniqueOrThrow({ where: { id: reply.id } });
  });

  return { ok: true, reply: result, review: await loadPresentedReview(app, organizationId, reviewId) };
}

export async function rejectReply(
  app: FastifyInstance,
  request: FastifyRequest,
  reviewId: string,
  replyId: string,
  reason?: string,
) {
  const organizationId = request.auth!.organizationId!;
  const reply = await requireLatestReplyVersion(app, organizationId, reviewId, replyId);
  if (!['PENDING', 'READY_TO_PUBLISH'].includes(reply.status)) {
    throw new AppError({
      code: 'REVIEW_REPLY_INVALID_TRANSITION',
      message: 'Отклонить можно только ответ на согласовании',
      statusCode: 409,
    });
  }

  const result = await app.prisma.$transaction(async (tx) => {
    const changed = await tx.reviewReply.updateMany({
      where: { id: reply.id, organizationId, reviewId, status: reply.status },
      data: { status: 'REJECTED', failedReason: reason || null },
    });
    if (changed.count !== 1) {
      throw new AppError({ code: 'REVIEW_REPLY_INVALID_TRANSITION', message: 'Статус ответа уже изменился', statusCode: 409 });
    }
    await tx.review.update({ where: { id: reviewId }, data: { workflowStatus: 'REJECTED' } });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: 'review.reply.rejected',
        entityType: 'reviewReply',
        entityId: reply.id,
        metadata: { reviewId, version: reply.version, reason: reason || null },
        ...auditContext(request),
      },
    });
    return tx.reviewReply.findUniqueOrThrow({ where: { id: reply.id } });
  });

  return { ok: true, reply: result, review: await loadPresentedReview(app, organizationId, reviewId) };
}

export async function requestPublishReply(
  app: FastifyInstance,
  request: FastifyRequest,
  reviewId: string,
  replyId: string,
) {
  const organizationId = request.auth!.organizationId!;
  const reply = await requireLatestReplyVersion(app, organizationId, reviewId, replyId);
  if (reply.status !== 'READY_TO_PUBLISH') {
    throw new AppError({
      code: 'REVIEW_REPLY_INVALID_TRANSITION',
      message: 'Публиковать можно только согласованный ответ',
      statusCode: 409,
    });
  }

  // This endpoint is intentionally truthful until a provider-specific publisher
  // confirms the external write. It performs no state mutation and never marks
  // a reply PUBLISHED locally.
  throw new AppError({
    code: 'REVIEW_PUBLISH_NOT_AVAILABLE',
    message: 'Публикация во внешнем источнике недоступна без production provider adapter',
    statusCode: 422,
  });
}

export async function listReplyHistory(app: FastifyInstance, organizationId: string, reviewId: string) {
  await requireTenantReview(app, organizationId, reviewId);
  return app.prisma.reviewReply.findMany({
    where: { organizationId, reviewId },
    select: {
      id: true,
      text: true,
      status: true,
      version: true,
      providerReplyId: true,
      publishRequestedAt: true,
      publishedAt: true,
      retryCount: true,
      failedReason: true,
      createdAt: true,
      updatedAt: true,
      authorUser: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { version: 'desc' },
  });
}
