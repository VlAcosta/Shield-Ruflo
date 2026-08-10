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

  await app.prisma.$transaction(async (tx) => {
    const latest = await tx.reviewReply.findFirst({
      where: { organizationId, reviewId },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    await tx.reviewReply.create({
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
        metadata: { version },
        ...auditContext(request),
      },
    });
  });

  const review = await app.prisma.review.findFirst({ where: { id: reviewId, organizationId }, include: reviewInclude });
  return { ok: true, review: presentReview(review) };
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
