import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { requireActiveBusiness, requireActiveLocation } from '../organizations/organization.service.js';

type ReviewStatusValue = 'NEW' | 'DEFERRED' | 'DONE' | 'ARCHIVED';
type ReviewWorkflowValue = 'INBOX' | 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'PUBLISHED' | 'REJECTED';

function auditContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
  };
}

function normalizeStatus(value: string): ReviewStatusValue {
  const normalized = value.trim().toUpperCase();
  if (!['NEW', 'DEFERRED', 'DONE', 'ARCHIVED'].includes(normalized)) {
    throw new AppError({ code: 'INVALID_REVIEW_STATUS', message: 'Некорректный статус отзыва', statusCode: 400 });
  }
  return normalized as ReviewStatusValue;
}

function normalizeWorkflow(value: string): ReviewWorkflowValue {
  const normalized = value.trim().toUpperCase();
  if (!['INBOX', 'DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED'].includes(normalized)) {
    throw new AppError({ code: 'INVALID_REVIEW_WORKFLOW', message: 'Некорректный этап обработки отзыва', statusCode: 400 });
  }
  return normalized as ReviewWorkflowValue;
}

function frontendStatus(value: string) {
  return value.toLowerCase();
}

function frontendWorkflow(value: string) {
  return value.toLowerCase();
}

export const reviewInclude = {
  source: { select: { id: true, provider: true, name: true, externalUrl: true, status: true } },
  author: { select: { id: true, name: true, avatarUrl: true, profileUrl: true } },
  business: { select: { id: true, name: true } },
  location: { select: { id: true, name: true, city: true } },
  tags: { include: { tag: { select: { id: true, name: true, slug: true, color: true } } } },
  replies: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, text: true, status: true, publishedAt: true, createdAt: true, authorUserId: true } },
  assignments: {
    where: { status: 'ACTIVE' as const },
    include: { member: { include: { user: { select: { id: true, firstName: true, lastName: true, displayName: true, email: true } } } } },
  },
} as const;

export function presentReview(review: any) {
  const reply = review.replies?.[0] ?? null;
  const tags = (review.tags ?? []).map((link: any) => link.tag);
  const assignments = (review.assignments ?? []).map((assignment: any) => ({
    id: assignment.id,
    memberId: assignment.organizationMemberId,
    userId: assignment.member?.user?.id ?? null,
    name: assignment.member?.user?.displayName
      || `${assignment.member?.user?.firstName || ''} ${assignment.member?.user?.lastName || ''}`.trim()
      || assignment.member?.user?.email
      || 'Участник',
    note: assignment.note || '',
  }));
  return {
    id: review.id,
    externalId: review.externalId,
    platform: review.source?.name || review.source?.provider || 'Источник',
    provider: review.source?.provider || '',
    sourceId: review.sourceId,
    sourceUrl: review.sourceUrl || review.source?.externalUrl || '',
    businessId: review.businessId,
    business: review.business || null,
    locationId: review.locationId,
    location: review.location || null,
    author: review.author?.name || 'Гость',
    authorDetails: review.author || null,
    rating: review.rating,
    title: review.title || '',
    text: review.text,
    status: frontendStatus(review.status),
    workflowStatus: frontendWorkflow(review.workflowStatus),
    tags: tags.map((tag: any) => tag.name),
    tagItems: tags,
    reply: reply?.text || '',
    replyStatus: reply?.status?.toLowerCase?.() || null,
    repliedAt: review.repliedAt?.toISOString?.() || reply?.publishedAt?.toISOString?.() || null,
    createdAt: review.receivedAt.toISOString(),
    publishedAt: review.publishedAt?.toISOString?.() || null,
    receivedAt: review.receivedAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    assignments,
    metadata: review.metadata || null,
  };
}

async function requireTenantReview(app: FastifyInstance, organizationId: string, reviewId: string) {
  const review = await app.prisma.review.findFirst({ where: { id: reviewId, organizationId }, include: reviewInclude });
  if (!review) throw new AppError({ code: 'REVIEW_NOT_FOUND', message: 'Отзыв не найден', statusCode: 404 });
  return review;
}

export async function listReviews(app: FastifyInstance, request: FastifyRequest, query: any) {
  const organizationId = request.auth!.organizationId!;
  const where: any = { organizationId };
  if (query.status?.length) where.status = { in: query.status.map(normalizeStatus) };
  if (query.workflowStatus?.length) where.workflowStatus = { in: query.workflowStatus.map(normalizeWorkflow) };
  if (query.rating) where.rating = query.rating;
  if (query.minRating || query.maxRating) where.rating = { ...(query.minRating ? { gte: query.minRating } : {}), ...(query.maxRating ? { lte: query.maxRating } : {}) };
  if (query.sourceId) where.sourceId = query.sourceId;
  if (query.businessId) where.businessId = query.businessId;
  if (query.locationId) where.locationId = query.locationId;
  if (query.tag) where.tags = { some: { tag: { OR: [{ slug: query.tag.toLowerCase() }, { name: { equals: query.tag, mode: 'insensitive' } }] } } };
  if (query.assignedToMe && request.auth!.membershipId) where.assignments = { some: { organizationMemberId: request.auth!.membershipId, status: 'ACTIVE' } };
  if (query.q) where.OR = [
    { text: { contains: query.q, mode: 'insensitive' } },
    { title: { contains: query.q, mode: 'insensitive' } },
    { author: { name: { contains: query.q, mode: 'insensitive' } } },
  ];

  const skip = (query.page - 1) * query.pageSize;
  const orderBy: any = { [query.sort]: query.order };
  const [total, items] = await app.prisma.$transaction([
    app.prisma.review.count({ where }),
    app.prisma.review.findMany({ where, include: reviewInclude, orderBy, skip, take: query.pageSize }),
  ]);
  return {
    items: items.map(presentReview),
    pagination: { page: query.page, pageSize: query.pageSize, total, pages: Math.max(1, Math.ceil(total / query.pageSize)) },
  };
}

export async function getReview(app: FastifyInstance, organizationId: string, reviewId: string) {
  return presentReview(await requireTenantReview(app, organizationId, reviewId));
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9а-яё]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 100) || `tag-${Date.now()}`;
}

async function syncTags(tx: any, organizationId: string, reviewId: string, names: string[]) {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  await tx.reviewTagLink.deleteMany({ where: { reviewId } });
  for (const name of unique) {
    const base = slugify(name);
    let tag = await tx.reviewTag.findFirst({ where: { organizationId, OR: [{ name: { equals: name, mode: 'insensitive' } }, { slug: base }] } });
    if (!tag) tag = await tx.reviewTag.create({ data: { organizationId, name, slug: base } });
    await tx.reviewTagLink.create({ data: { reviewId, tagId: tag.id } });
  }
}

export async function updateReview(app: FastifyInstance, request: FastifyRequest, reviewId: string, patch: any) {
  const organizationId = request.auth!.organizationId!;
  await requireTenantReview(app, organizationId, reviewId);
  await app.prisma.$transaction(async (tx) => {
    await tx.review.update({
      where: { id: reviewId },
      data: {
        ...(patch.status !== undefined ? { status: normalizeStatus(patch.status) } : {}),
        ...(patch.workflowStatus !== undefined ? { workflowStatus: normalizeWorkflow(patch.workflowStatus) } : {}),
      },
    });
    if (patch.tags !== undefined) await syncTags(tx, organizationId, reviewId, patch.tags);
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: 'review.updated',
        entityType: 'review',
        entityId: reviewId,
        metadata: patch,
        ...auditContext(request),
      },
    });
  });
  return { review: presentReview(await requireTenantReview(app, organizationId, reviewId)) };
}

export async function replyToReview(app: FastifyInstance, request: FastifyRequest, reviewId: string, body: { text: string; publish: boolean }) {
  const organizationId = request.auth!.organizationId!;
  await requireTenantReview(app, organizationId, reviewId);
  const status = body.publish ? 'PUBLISHED' : 'DRAFT';
  const now = new Date();
  await app.prisma.$transaction(async (tx) => {
    await tx.reviewReply.create({
      data: {
        organizationId,
        reviewId,
        authorUserId: request.auth!.userId,
        text: body.text,
        status,
        ...(body.publish ? { publishedAt: now } : {}),
      },
    });
    await tx.review.update({
      where: { id: reviewId },
      data: body.publish
        ? { status: 'DONE', workflowStatus: 'PUBLISHED', repliedAt: now }
        : { status: 'DEFERRED', workflowStatus: 'DRAFT' },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: body.publish ? 'review.reply.published' : 'review.reply.drafted',
        entityType: 'review',
        entityId: reviewId,
        ...auditContext(request),
      },
    });
  });
  return { ok: true, review: presentReview(await requireTenantReview(app, organizationId, reviewId)) };
}

export async function assignReview(app: FastifyInstance, request: FastifyRequest, reviewId: string, memberId: string, note?: string) {
  const organizationId = request.auth!.organizationId!;
  await requireTenantReview(app, organizationId, reviewId);
  const member = await app.prisma.organizationMember.findFirst({ where: { id: memberId, organizationId, status: 'ACTIVE' } });
  if (!member || (member.accessExpiresAt && member.accessExpiresAt <= new Date())) {
    throw new AppError({ code: 'TEAM_MEMBER_NOT_FOUND', message: 'Участник команды не найден', statusCode: 404 });
  }
  const assignment = await app.prisma.reviewAssignment.upsert({
    where: { reviewId_organizationMemberId: { reviewId, organizationMemberId: memberId } },
    create: { organizationId, reviewId, organizationMemberId: memberId, assignedByUserId: request.auth!.userId, note: note || null, status: 'ACTIVE' },
    update: { assignedByUserId: request.auth!.userId, note: note || null, status: 'ACTIVE', completedAt: null },
  });
  await app.prisma.auditLog.create({ data: { organizationId, actorUserId: request.auth!.userId, action: 'review.assigned', entityType: 'review', entityId: reviewId, metadata: { memberId }, ...auditContext(request) } });
  return { ok: true, assignment };
}

export async function removeAssignment(app: FastifyInstance, request: FastifyRequest, reviewId: string, assignmentId: string) {
  const organizationId = request.auth!.organizationId!;
  await requireTenantReview(app, organizationId, reviewId);
  const assignment = await app.prisma.reviewAssignment.findFirst({ where: { id: assignmentId, organizationId, reviewId } });
  if (!assignment) throw new AppError({ code: 'REVIEW_ASSIGNMENT_NOT_FOUND', message: 'Назначение не найдено', statusCode: 404 });
  await app.prisma.reviewAssignment.update({ where: { id: assignmentId }, data: { status: 'CANCELED' } });
  return { ok: true };
}

export async function listSources(app: FastifyInstance, organizationId: string) {
  return app.prisma.reviewSource.findMany({ where: { organizationId }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }], include: { business: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } } });
}

export async function createSource(app: FastifyInstance, request: FastifyRequest, body: any) {
  const organizationId = request.auth!.organizationId!;
  await requireActiveBusiness(app, organizationId, body.businessId);
  if (body.locationId) {
    const location = await requireActiveLocation(app, organizationId, body.locationId);
    if (location.business.id !== body.businessId) throw new AppError({ code: 'LOCATION_NOT_FOUND', message: 'Филиал не найден', statusCode: 404 });
  }
  const source = await app.prisma.reviewSource.create({ data: { organizationId, ...body } });
  return { source };
}

export async function updateSource(app: FastifyInstance, request: FastifyRequest, sourceId: string, body: any) {
  const organizationId = request.auth!.organizationId!;
  const existing = await app.prisma.reviewSource.findFirst({ where: { id: sourceId, organizationId } });
  if (!existing) throw new AppError({ code: 'REVIEW_SOURCE_NOT_FOUND', message: 'Источник отзывов не найден', statusCode: 404 });
  if (body.locationId) await requireActiveLocation(app, organizationId, body.locationId);
  return { source: await app.prisma.reviewSource.update({ where: { id: sourceId }, data: body }) };
}

export async function listTags(app: FastifyInstance, organizationId: string) {
  return app.prisma.reviewTag.findMany({ where: { organizationId }, orderBy: { name: 'asc' } });
}

export async function createTag(app: FastifyInstance, organizationId: string, body: { name: string; color?: string | null | undefined }) {
  const slug = slugify(body.name);
  const existing = await app.prisma.reviewTag.findUnique({ where: { organizationId_slug: { organizationId, slug } } });
  if (existing) return { tag: existing };
  return { tag: await app.prisma.reviewTag.create({ data: { organizationId, name: body.name, slug, color: body.color ?? null } }) };
}

export async function seedReview(app: FastifyInstance, request: FastifyRequest, body: any) {
  const organizationId = request.auth!.organizationId!;
  const source = await app.prisma.reviewSource.findFirst({ where: { id: body.sourceId, organizationId, businessId: body.businessId } });
  if (!source) throw new AppError({ code: 'REVIEW_SOURCE_NOT_FOUND', message: 'Источник отзывов не найден', statusCode: 404 });
  if (body.locationId) await requireActiveLocation(app, organizationId, body.locationId);
  let authorId: string | null = null;
  if (body.author) {
    const externalId = body.author.externalId || `local:${body.author.name.toLowerCase()}`;
    const author = await app.prisma.reviewAuthor.upsert({
      where: { sourceId_externalId: { sourceId: body.sourceId, externalId } },
      create: { organizationId, sourceId: body.sourceId, externalId, name: body.author.name, avatarUrl: body.author.avatarUrl || null, profileUrl: body.author.profileUrl || null },
      update: { name: body.author.name, avatarUrl: body.author.avatarUrl || null, profileUrl: body.author.profileUrl || null },
    });
    authorId = author.id;
  }
  const review = await app.prisma.review.upsert({
    where: { sourceId_externalId: { sourceId: body.sourceId, externalId: body.externalId } },
    create: {
      organizationId,
      businessId: body.businessId,
      locationId: body.locationId || null,
      sourceId: body.sourceId,
      authorId,
      externalId: body.externalId,
      rating: body.rating,
      title: body.title || null,
      text: body.text,
      sourceUrl: body.sourceUrl || null,
      publishedAt: body.publishedAt || null,
      metadata: body.metadata || null,
      receivedAt: new Date(),
    },
    update: {
      authorId,
      rating: body.rating,
      title: body.title || null,
      text: body.text,
      sourceUrl: body.sourceUrl || null,
      publishedAt: body.publishedAt || null,
      metadata: body.metadata || null,
    },
    include: reviewInclude,
  });
  return { review: presentReview(review) };
}
