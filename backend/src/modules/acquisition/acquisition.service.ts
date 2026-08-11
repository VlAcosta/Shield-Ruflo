import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { createReputationCase } from '../cases/cases.service.js';
import type { CreateAcquisitionCampaignInput, UpdateAcquisitionCampaignInput } from './acquisition.schemas.js';

const campaignInclude = {
  business: { select: { id: true, name: true } },
  location: { select: { id: true, name: true, city: true, region: true } },
  targets: { orderBy: [{ priority: 'asc' as const }, { createdAt: 'asc' as const }] },
} satisfies Prisma.ReviewAcquisitionCampaignInclude;

const feedbackInclude = {
  location: { select: { id: true, name: true } },
  case: { select: { id: true, title: true, severity: true, status: true } },
} satisfies Prisma.ReviewAcquisitionFeedbackInclude;

function hash(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function publicSlug(): string {
  return randomBytes(18).toString('base64url');
}

function inviteToken(): string {
  return randomBytes(32).toString('base64url');
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function assertScope(app: FastifyInstance, organizationId: string, input: { businessId?: string | null; locationId?: string | null }) {
  if (input.businessId) {
    const business = await app.prisma.business.findFirst({ where: { id: input.businessId, organizationId, status: 'ACTIVE' }, select: { id: true } });
    if (!business) throw new AppError({ code: 'ACQUISITION_BUSINESS_NOT_FOUND', message: 'Бизнес не найден', statusCode: 404 });
  }
  if (input.locationId) {
    const location = await app.prisma.location.findFirst({
      where: { id: input.locationId, status: 'ACTIVE', business: { organizationId, ...(input.businessId ? { id: input.businessId } : {}) } },
      select: { id: true, businessId: true },
    });
    if (!location) throw new AppError({ code: 'ACQUISITION_LOCATION_NOT_FOUND', message: 'Локация не найдена', statusCode: 404 });
    if (input.businessId && location.businessId !== input.businessId) {
      throw new AppError({ code: 'ACQUISITION_LOCATION_SCOPE_MISMATCH', message: 'Локация не относится к выбранному бизнесу', statusCode: 422 });
    }
  }
}

function targetPublic(target: { id: string; provider: string; label: string; priority: number }) {
  return { id: target.id, provider: target.provider, label: target.label, priority: target.priority };
}

function presentCampaign(row: any) {
  return {
    id: row.id,
    name: row.name,
    status: String(row.status).toLowerCase(),
    channel: String(row.channel).toLowerCase(),
    businessId: row.businessId,
    business: row.business ?? null,
    locationId: row.locationId,
    location: row.location ?? null,
    publicSlug: row.publicSlug,
    publicPath: `/r/${row.publicSlug}`,
    headline: row.headline,
    description: row.description,
    thankYouMessage: row.thankYouMessage,
    collectContact: row.collectContact,
    caseBelowRating: row.caseBelowRating,
    targets: (row.targets ?? []).map((target: any) => ({ ...target, url: target.url })),
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

async function activeCampaignBySlug(app: FastifyInstance, slug: string) {
  const row = await app.prisma.reviewAcquisitionCampaign.findUnique({ where: { publicSlug: slug }, include: campaignInclude });
  if (!row || row.status !== 'ACTIVE' || row.archivedAt) {
    throw new AppError({ code: 'ACQUISITION_CAMPAIGN_NOT_AVAILABLE', message: 'Кампания недоступна', statusCode: 404 });
  }
  return row;
}

async function resolveInvite(app: FastifyInstance, campaignId: string, token?: string) {
  if (!token) return null;
  const tokenHash = hash(token);
  const invite = await app.prisma.reviewAcquisitionInvite.findFirst({
    where: { campaignId, tokenHash },
  });
  if (!invite || invite.status === 'REVOKED') {
    throw new AppError({ code: 'ACQUISITION_INVITE_INVALID', message: 'Ссылка приглашения недействительна', statusCode: 404 });
  }
  if (invite.expiresAt.getTime() <= Date.now()) {
    if (invite.status !== 'EXPIRED') await app.prisma.reviewAcquisitionInvite.update({ where: { id: invite.id }, data: { status: 'EXPIRED' } });
    throw new AppError({ code: 'ACQUISITION_INVITE_EXPIRED', message: 'Срок действия приглашения истёк', statusCode: 410 });
  }
  if (invite.status === 'CREATED') {
    await app.prisma.$transaction([
      app.prisma.reviewAcquisitionInvite.update({ where: { id: invite.id }, data: { status: 'OPENED', openedAt: new Date() } }),
      app.prisma.reviewAcquisitionEvent.create({
        data: { organizationId: invite.organizationId, campaignId, inviteId: invite.id, type: 'INVITE_OPENED' },
      }),
    ]);
    return { ...invite, status: 'OPENED' as const };
  }
  return invite;
}

async function recordView(app: FastifyInstance, row: { id: string; organizationId: string }, session?: string) {
  const sessionHash = session ? hash(session) : null;
  const dedupeKey = sessionHash ? `view:${sessionHash}` : null;
  try {
    await app.prisma.reviewAcquisitionEvent.create({
      data: {
        organizationId: row.organizationId,
        campaignId: row.id,
        type: 'VIEW',
        anonymousSessionHash: sessionHash,
        dedupeKey,
      },
    });
  } catch (error) {
    if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) throw error;
  }
}

export async function createCampaign(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  input: CreateAcquisitionCampaignInput,
) {
  await assertScope(app, context.organizationId, {
    ...(input.businessId !== undefined ? { businessId: input.businessId } : {}),
    ...(input.locationId !== undefined ? { locationId: input.locationId } : {}),
  });
  const created = await app.prisma.$transaction(async (tx) => {
    const campaign = await tx.reviewAcquisitionCampaign.create({
      data: {
        organizationId: context.organizationId,
        businessId: input.businessId ?? null,
        locationId: input.locationId ?? null,
        name: input.name,
        channel: input.channel,
        publicSlug: publicSlug(),
        headline: input.headline,
        description: input.description,
        thankYouMessage: input.thankYouMessage,
        collectContact: input.collectContact,
        caseBelowRating: input.caseBelowRating,
        createdByUserId: context.userId,
        ...(input.targets.length ? { targets: { createMany: { data: input.targets } } } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: 'review_acquisition.campaign_created',
        entityType: 'ReviewAcquisitionCampaign',
        entityId: campaign.id,
        metadata: { channel: input.channel, locationId: input.locationId ?? null, targetCount: input.targets.length },
      },
    });
    return campaign;
  });
  const row = await app.prisma.reviewAcquisitionCampaign.findUniqueOrThrow({ where: { id: created.id }, include: campaignInclude });
  return presentCampaign(row);
}

export async function updateCampaign(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  campaignId: string,
  patch: UpdateAcquisitionCampaignInput,
) {
  const existing = await app.prisma.reviewAcquisitionCampaign.findFirst({ where: { id: campaignId, organizationId: context.organizationId, archivedAt: null } });
  if (!existing) throw new AppError({ code: 'ACQUISITION_CAMPAIGN_NOT_FOUND', message: 'Кампания не найдена', statusCode: 404 });
  await assertScope(app, context.organizationId, {
    businessId: patch.businessId !== undefined ? patch.businessId : existing.businessId,
    locationId: patch.locationId !== undefined ? patch.locationId : existing.locationId,
  });

  if (patch.status === 'ACTIVE') {
    const targetCount = patch.targets !== undefined
      ? patch.targets.filter((target) => target.enabled).length
      : await app.prisma.reviewAcquisitionTarget.count({ where: { campaignId, enabled: true } });
    if (targetCount === 0) {
      throw new AppError({ code: 'ACQUISITION_TARGET_REQUIRED', message: 'Перед запуском добавьте хотя бы одну публичную площадку для отзывов', statusCode: 422 });
    }
  }

  await app.prisma.$transaction(async (tx) => {
    await tx.reviewAcquisitionCampaign.update({
      where: { id: existing.id },
      data: {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.status !== undefined ? { status: patch.status, ...(patch.status === 'ARCHIVED' ? { archivedAt: new Date() } : {}) } : {}),
        ...(patch.channel !== undefined ? { channel: patch.channel } : {}),
        ...(patch.businessId !== undefined ? { businessId: patch.businessId } : {}),
        ...(patch.locationId !== undefined ? { locationId: patch.locationId } : {}),
        ...(patch.headline !== undefined ? { headline: patch.headline } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.thankYouMessage !== undefined ? { thankYouMessage: patch.thankYouMessage } : {}),
        ...(patch.collectContact !== undefined ? { collectContact: patch.collectContact } : {}),
        ...(patch.caseBelowRating !== undefined ? { caseBelowRating: patch.caseBelowRating } : {}),
      },
    });
    if (patch.targets !== undefined) {
      await tx.reviewAcquisitionTarget.deleteMany({ where: { campaignId: existing.id } });
      if (patch.targets.length) await tx.reviewAcquisitionTarget.createMany({ data: patch.targets.map((target) => ({ ...target, campaignId: existing.id })) });
    }
    await tx.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: 'review_acquisition.campaign_updated',
        entityType: 'ReviewAcquisitionCampaign',
        entityId: existing.id,
        metadata: json({ fields: Object.keys(patch) }),
      },
    });
  });
  return presentCampaign(await app.prisma.reviewAcquisitionCampaign.findUniqueOrThrow({ where: { id: existing.id }, include: campaignInclude }));
}

export async function listCampaigns(app: FastifyInstance, organizationId: string, query: { status?: string; locationId?: string; limit: number; cursor?: string }) {
  const rows = await app.prisma.reviewAcquisitionCampaign.findMany({
    where: {
      organizationId,
      archivedAt: null,
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.locationId ? { locationId: query.locationId } : {}),
    },
    include: campaignInclude,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return { items: page.map(presentCampaign), nextCursor: hasMore ? page.at(-1)?.id ?? null : null };
}

export async function getCampaign(app: FastifyInstance, organizationId: string, campaignId: string) {
  const row = await app.prisma.reviewAcquisitionCampaign.findFirst({ where: { id: campaignId, organizationId, archivedAt: null }, include: campaignInclude });
  if (!row) throw new AppError({ code: 'ACQUISITION_CAMPAIGN_NOT_FOUND', message: 'Кампания не найдена', statusCode: 404 });
  return presentCampaign(row);
}

export async function getPublicCampaign(app: FastifyInstance, slug: string, input: { invite?: string; session?: string }) {
  const row = await activeCampaignBySlug(app, slug);
  const invite = await resolveInvite(app, row.id, input.invite);
  await recordView(app, row, input.session);
  return {
    campaign: {
      slug: row.publicSlug,
      headline: row.headline,
      description: row.description,
      thankYouMessage: row.thankYouMessage,
      collectContact: row.collectContact,
      location: row.location ? { name: row.location.name, city: row.location.city, region: row.location.region } : null,
      publicReviewTargets: row.targets.filter((target) => target.enabled).map(targetPublic),
    },
    invite: invite ? { id: invite.id, channel: String(invite.channel).toLowerCase() } : null,
    compliance: {
      reviewGating: false,
      message: 'Публичные площадки доступны независимо от оценки first-party feedback.',
    },
  };
}

export async function submitPublicFeedback(
  app: FastifyInstance,
  slug: string,
  input: {
    rating: number;
    text: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    consentToContact: boolean;
    invite?: string;
    session?: string;
  },
) {
  const campaign = await activeCampaignBySlug(app, slug);
  const invite = await resolveInvite(app, campaign.id, input.invite);
  if (invite?.status === 'CONVERTED') {
    throw new AppError({
      code: 'ACQUISITION_INVITE_ALREADY_CONVERTED',
      message: 'Обратная связь по этому приглашению уже отправлена',
      statusCode: 409,
    });
  }
  const allowContact = campaign.collectContact && input.consentToContact;
  const submittedAt = new Date();

  const feedback = await app.prisma.$transaction(async (tx) => {
    const created = await tx.reviewAcquisitionFeedback.create({
      data: {
        organizationId: campaign.organizationId,
        campaignId: campaign.id,
        locationId: campaign.locationId,
        inviteId: invite?.id ?? null,
        rating: input.rating,
        text: input.text,
        contactName: allowContact ? input.contactName ?? null : null,
        contactEmail: allowContact ? input.contactEmail ?? null : null,
        contactPhone: allowContact ? input.contactPhone ?? null : null,
        consentToContact: allowContact,
        submittedAt,
      },
    });
    await tx.reviewAcquisitionEvent.create({
      data: {
        organizationId: campaign.organizationId,
        campaignId: campaign.id,
        inviteId: invite?.id ?? null,
        feedbackId: created.id,
        type: 'FEEDBACK_SUBMITTED',
        anonymousSessionHash: input.session ? hash(input.session) : null,
      },
    });
    if (invite) {
      await tx.reviewAcquisitionInvite.update({ where: { id: invite.id }, data: { status: 'CONVERTED', convertedAt: submittedAt } });
    }
    return created;
  });

  let caseId: string | null = null;
  if (campaign.caseBelowRating !== null && input.rating <= campaign.caseBelowRating) {
    try {
      const severity = input.rating <= 1 ? 'CRITICAL' as const : input.rating <= 2 ? 'HIGH' as const : 'MEDIUM' as const;
      const result = await createReputationCase(app, { organizationId: campaign.organizationId, userId: null }, {
        title: `First-party feedback ${input.rating}★ · ${campaign.name}`,
        category: 'first-party-feedback',
        severity,
        origin: 'SURVEY',
        reviewIds: [],
        locationIds: campaign.locationId ? [campaign.locationId] : [],
        sourceDedupeKey: `acquisition-feedback:${feedback.id}`,
        rootCause: input.text || `First-party feedback ${input.rating}★`,
      });
      caseId = result.case.id;
      await app.prisma.reviewAcquisitionFeedback.update({ where: { id: feedback.id }, data: { caseId, status: 'CASE_OPENED' } });
    } catch (error) {
      app.log.error({ err: error, feedbackId: feedback.id, campaignId: campaign.id }, 'Unable to open ReputationCase from acquisition feedback');
    }
  }

  // Anti-gating guarantee: target list does not depend on rating, sentiment, text or case creation.
  const publicReviewTargets = campaign.targets.filter((target) => target.enabled).map(targetPublic);
  return {
    feedbackId: feedback.id,
    thankYouMessage: campaign.thankYouMessage,
    caseOpened: Boolean(caseId),
    publicReviewTargets,
    compliance: { reviewGating: false },
  };
}

export async function createInvite(
  app: FastifyInstance,
  context: { organizationId: string; userId: string },
  campaignId: string,
  input: { channel: string; expiresInDays: number; externalReference?: string },
) {
  const campaign = await app.prisma.reviewAcquisitionCampaign.findFirst({ where: { id: campaignId, organizationId: context.organizationId, archivedAt: null } });
  if (!campaign) throw new AppError({ code: 'ACQUISITION_CAMPAIGN_NOT_FOUND', message: 'Кампания не найдена', statusCode: 404 });
  const token = inviteToken();
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  const row = await app.prisma.$transaction(async (tx) => {
    const invite = await tx.reviewAcquisitionInvite.create({
      data: {
        organizationId: context.organizationId,
        campaignId,
        channel: input.channel as any,
        tokenHash: hash(token),
        tokenHint: token.slice(-8),
        expiresAt,
        externalReference: input.externalReference ?? null,
        createdByUserId: context.userId,
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: context.organizationId,
        actorUserId: context.userId,
        action: 'review_acquisition.invite_created',
        entityType: 'ReviewAcquisitionInvite',
        entityId: invite.id,
        metadata: { campaignId, channel: input.channel, expiresAt: expiresAt.toISOString() },
      },
    });
    return invite;
  });
  return {
    id: row.id,
    status: 'created',
    channel: String(row.channel).toLowerCase(),
    expiresAt: row.expiresAt.toISOString(),
    publicPath: `/r/${campaign.publicSlug}?invite=${encodeURIComponent(token)}`,
    delivery: { status: 'not_sent', reason: 'NO_DELIVERY_ADAPTER' },
  };
}

export async function listFeedback(app: FastifyInstance, organizationId: string, campaignId: string, query: { rating?: number; status?: string; limit: number; cursor?: string }) {
  const campaign = await app.prisma.reviewAcquisitionCampaign.findFirst({ where: { id: campaignId, organizationId }, select: { id: true } });
  if (!campaign) throw new AppError({ code: 'ACQUISITION_CAMPAIGN_NOT_FOUND', message: 'Кампания не найдена', statusCode: 404 });
  const rows = await app.prisma.reviewAcquisitionFeedback.findMany({
    where: {
      organizationId,
      campaignId,
      ...(query.rating ? { rating: query.rating } : {}),
      ...(query.status ? { status: query.status as any } : {}),
    },
    include: feedbackInclude,
    orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  return {
    items: page.map((row) => ({
      id: row.id,
      rating: row.rating,
      text: row.text,
      status: String(row.status).toLowerCase(),
      location: row.location,
      consentToContact: row.consentToContact,
      contactName: row.contactName,
      contactEmail: row.contactEmail,
      contactPhone: row.contactPhone,
      case: row.case ? { ...row.case, severity: String(row.case.severity).toLowerCase(), status: String(row.case.status).toLowerCase() } : null,
      submittedAt: row.submittedAt.toISOString(),
    })),
    nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
  };
}

export async function acquisitionMetrics(app: FastifyInstance, organizationId: string, campaignId: string, input: { from?: string; to?: string }) {
  const campaign = await app.prisma.reviewAcquisitionCampaign.findFirst({ where: { id: campaignId, organizationId }, select: { id: true } });
  if (!campaign) throw new AppError({ code: 'ACQUISITION_CAMPAIGN_NOT_FOUND', message: 'Кампания не найдена', statusCode: 404 });
  const from = input.from ? new Date(input.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const to = input.to ? new Date(input.to) : new Date();
  const [events, feedback] = await Promise.all([
    app.prisma.reviewAcquisitionEvent.groupBy({
      by: ['type'],
      where: { organizationId, campaignId, createdAt: { gte: from, lte: to } },
      _count: { _all: true },
    }),
    app.prisma.reviewAcquisitionFeedback.findMany({
      where: { organizationId, campaignId, submittedAt: { gte: from, lte: to } },
      select: { rating: true, caseId: true },
    }),
  ]);
  const counts = Object.fromEntries(events.map((row) => [String(row.type), row._count._all])) as Record<string, number>;
  const views = counts.VIEW ?? 0;
  const feedbackCount = counts.FEEDBACK_SUBMITTED ?? feedback.length;
  const publicClicks = counts.REVIEW_TARGET_CLICK ?? 0;
  const ratingBreakdown = [1, 2, 3, 4, 5].map((rating) => ({ rating, count: feedback.filter((item) => item.rating === rating).length }));
  const averageRating = feedback.length ? Number((feedback.reduce((sum, item) => sum + item.rating, 0) / feedback.length).toFixed(2)) : null;
  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    views,
    feedbackSubmitted: feedbackCount,
    publicReviewTargetClicks: publicClicks,
    feedbackConversion: views ? Number((feedbackCount / views).toFixed(4)) : 0,
    publicReviewClickConversion: views ? Number((publicClicks / views).toFixed(4)) : 0,
    averageFirstPartyRating: averageRating,
    casesOpened: feedback.filter((item) => Boolean(item.caseId)).length,
    ratingBreakdown,
  };
}

export async function recordReviewTargetClick(app: FastifyInstance, slug: string, targetId: string, input: { invite?: string; session?: string }) {
  const campaign = await activeCampaignBySlug(app, slug);
  const invite = await resolveInvite(app, campaign.id, input.invite);
  const target = campaign.targets.find((item) => item.id === targetId && item.enabled);
  if (!target) throw new AppError({ code: 'ACQUISITION_TARGET_NOT_FOUND', message: 'Площадка для отзыва недоступна', statusCode: 404 });
  await app.prisma.reviewAcquisitionEvent.create({
    data: {
      organizationId: campaign.organizationId,
      campaignId: campaign.id,
      inviteId: invite?.id ?? null,
      targetId: target.id,
      type: 'REVIEW_TARGET_CLICK',
      anonymousSessionHash: input.session ? hash(input.session) : null,
    },
  });
  return { url: target.url };
}
