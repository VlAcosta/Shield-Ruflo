import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { sha256 } from '../../shared/security/tokens.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type Actor = { organizationId: string; userId: string };

async function portfolio(app: FastifyInstance, actor: Actor) {
  const organization = await app.prisma.organization.findUnique({ where: { id: actor.organizationId }, select: { id: true, name: true } });
  if (!organization) throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Организация не найдена', statusCode: 404 });
  return app.prisma.agencyPortfolio.upsert({
    where: { organizationId: actor.organizationId },
    create: { organizationId: actor.organizationId, name: `${organization.name} · Agency` },
    update: {},
  });
}

export async function createAgencyInvitation(app: FastifyInstance, actor: Actor, clientOrganizationId: string) {
  if (clientOrganizationId === actor.organizationId) throw new AppError({ code: 'AGENCY_SELF_LINK_FORBIDDEN', message: 'Нельзя добавить текущую организацию как собственного клиента', statusCode: 409 });
  const target = await app.prisma.organization.findUnique({ where: { id: clientOrganizationId }, select: { id: true, name: true } });
  if (!target) throw new AppError({ code: 'AGENCY_CLIENT_ORGANIZATION_NOT_FOUND', message: 'Клиентская организация не найдена', statusCode: 404 });
  const agency = await portfolio(app, actor);
  const existing = await app.prisma.agencyClientLink.findUnique({ where: { agencyPortfolioId_clientOrganizationId: { agencyPortfolioId: agency.id, clientOrganizationId } } });
  if (existing?.status === 'ACTIVE') throw new AppError({ code: 'AGENCY_CLIENT_ALREADY_LINKED', message: 'Организация уже подключена к портфелю', statusCode: 409 });
  await app.prisma.agencyInvitation.updateMany({ where: { agencyPortfolioId: agency.id, clientOrganizationId, status: 'PENDING' }, data: { status: 'REVOKED' } });
  const token = crypto.randomBytes(32).toString('base64url');
  const invitation = await app.prisma.agencyInvitation.create({
    data: {
      agencyPortfolioId: agency.id,
      clientOrganizationId,
      tokenHash: sha256(token),
      createdByUserId: actor.userId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    },
    select: { id: true, clientOrganizationId: true, status: true, expiresAt: true, createdAt: true },
  });
  await app.prisma.auditLog.create({ data: { organizationId: actor.organizationId, actorUserId: actor.userId, action: 'agency.invitation.created', entityType: 'AgencyInvitation', entityId: invitation.id, metadata: { clientOrganizationId } } });
  return { invitation, token, targetOrganization: target };
}

export async function acceptAgencyInvitation(app: FastifyInstance, actor: Actor, token: string) {
  const invitation = await app.prisma.agencyInvitation.findUnique({ where: { tokenHash: sha256(token) }, include: { agencyPortfolio: { include: { organization: { select: { id: true, name: true } } } } } });
  if (!invitation || invitation.clientOrganizationId !== actor.organizationId) throw new AppError({ code: 'AGENCY_INVITATION_NOT_FOUND', message: 'Приглашение не найдено', statusCode: 404 });
  if (invitation.status !== 'PENDING') throw new AppError({ code: 'AGENCY_INVITATION_NOT_PENDING', message: 'Приглашение уже недействительно', statusCode: 409 });
  if (invitation.expiresAt <= new Date()) {
    await app.prisma.agencyInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
    throw new AppError({ code: 'AGENCY_INVITATION_EXPIRED', message: 'Срок приглашения истёк', statusCode: 410 });
  }
  const link = await app.prisma.$transaction(async (tx) => {
    const created = await tx.agencyClientLink.upsert({
      where: { agencyPortfolioId_clientOrganizationId: { agencyPortfolioId: invitation.agencyPortfolioId, clientOrganizationId: actor.organizationId } },
      create: { agencyPortfolioId: invitation.agencyPortfolioId, clientOrganizationId: actor.organizationId, status: 'ACTIVE', acceptedByUserId: actor.userId },
      update: { status: 'ACTIVE', acceptedByUserId: actor.userId, acceptedAt: new Date() },
    });
    await tx.agencyInvitation.update({ where: { id: invitation.id }, data: { status: 'ACCEPTED', acceptedByUserId: actor.userId, acceptedAt: new Date() } });
    await tx.auditLog.create({ data: { organizationId: actor.organizationId, actorUserId: actor.userId, action: 'agency.invitation.accepted', entityType: 'AgencyClientLink', entityId: created.id, metadata: { agencyOrganizationId: invitation.agencyPortfolio.organizationId } } });
    return created;
  });
  return { link, agencyOrganization: invitation.agencyPortfolio.organization };
}

async function clientSummary(app: FastifyInstance, organizationId: string) {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [org, reviews, negative, cases, overdue, listing, aiRuns, aiMentions] = await Promise.all([
    app.prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true, name: true, slug: true, plan: true } }),
    app.prisma.review.aggregate({ where: { organizationId, receivedAt: { gte: from } }, _count: { _all: true }, _avg: { rating: true } }),
    app.prisma.review.count({ where: { organizationId, receivedAt: { gte: from }, rating: { lte: 2 } } }),
    app.prisma.reputationCase.count({ where: { organizationId, status: { notIn: ['RESOLVED', 'VERIFIED', 'CLOSED'] } } }),
    app.prisma.task.count({ where: { organizationId, deadline: { lt: now }, status: { notIn: ['DONE', 'ARCHIVED'] } } }),
    app.prisma.listingSnapshot.aggregate({ where: { organizationId }, _count: { _all: true }, _avg: { healthScore: true } }),
    app.prisma.aiVisibilityRun.count({ where: { organizationId, status: 'SUCCEEDED', completedAt: { gte: from } } }),
    app.prisma.aiVisibilityResult.count({ where: { organizationId, brandMentioned: true, createdAt: { gte: from } } }),
  ]);
  return {
    organization: org,
    period: { from, to: now },
    reputation: { reviewCount: reviews._count._all, averageRating: reviews._avg.rating === null ? null : Number(reviews._avg.rating.toFixed(2)), negativeReviewCount: negative, openCaseCount: cases, overdueTaskCount: overdue },
    listings: { snapshotCount: listing._count._all, averageHealthScore: listing._avg.healthScore === null ? null : Number(listing._avg.healthScore.toFixed(1)) },
    aiVisibility: { successfulRuns: aiRuns, brandMentionRuns: aiMentions, mentionRate: aiRuns ? Number(((aiMentions / aiRuns) * 100).toFixed(1)) : null },
  };
}

export async function agencyPortfolioOverview(app: FastifyInstance, actor: Actor) {
  const agency = await portfolio(app, actor);
  const links = await app.prisma.agencyClientLink.findMany({ where: { agencyPortfolioId: agency.id, status: { in: ['ACTIVE', 'PAUSED'] } }, orderBy: { createdAt: 'asc' } });
  const clients = await Promise.all(links.map(async (link) => ({ link, summary: await clientSummary(app, link.clientOrganizationId) })));
  return { portfolio: agency, clients };
}

export async function updateAgencyLink(app: FastifyInstance, actor: Actor, linkId: string, status: 'ACTIVE' | 'PAUSED' | 'REVOKED') {
  const agency = await portfolio(app, actor);
  const link = await app.prisma.agencyClientLink.findFirst({ where: { id: linkId, agencyPortfolioId: agency.id } });
  if (!link) throw new AppError({ code: 'AGENCY_CLIENT_LINK_NOT_FOUND', message: 'Связь с клиентом не найдена', statusCode: 404 });
  const updated = await app.prisma.agencyClientLink.update({ where: { id: link.id }, data: { status } });
  await app.prisma.auditLog.create({ data: { organizationId: actor.organizationId, actorUserId: actor.userId, action: 'agency.client.status_changed', entityType: 'AgencyClientLink', entityId: link.id, metadata: { status } } });
  return updated;
}
