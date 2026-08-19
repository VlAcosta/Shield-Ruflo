import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { sanitizeDelegatedPermissions, type Permission } from '../../core/rbac/permissions.js';
import { createOpaqueToken, hashSessionToken } from '../../shared/security/tokens.js';
import {
  cascadeGrantStatusForLink,
  createInvitation,
  findInvitationByTokenHash,
  listAgencyClientLinks,
  listDelegatedWorkspaces,
  markInvitationExpired,
  replaceLiveGrant,
  resolveDelegatedWorkspaceAccess,
  revokePendingInvitations,
  updateLinkStatus,
  upsertAgencyClientLink,
} from './agency.repository.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type AgencyActor = {
  organizationId: string;
  userId: string;
  sessionId: string;
  ipAddress: string;
  userAgent: string;
};

type InvitationInput = {
  clientOrganizationId: string;
  granteeUserId?: string | undefined;
  permissions: string[];
  grantExpiresAt?: string | null | undefined;
};

function normalizedDelegatedPermissions(input: string[]): Permission[] {
  const requested = [...new Set(input)];
  const sanitized = sanitizeDelegatedPermissions(requested);
  if (sanitized.length !== requested.length) {
    throw new AppError({
      code: 'AGENCY_PERMISSION_NOT_DELEGABLE',
      message: 'Запрошен недопустимый уровень делегированного доступа',
      statusCode: 400,
    });
  }
  return sanitized;
}

function parseFutureDate(value: string | null | undefined, now: Date): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date <= now) {
    throw new AppError({
      code: 'AGENCY_GRANT_EXPIRY_INVALID',
      message: 'Срок делегированного доступа должен быть в будущем',
      statusCode: 400,
    });
  }
  return date;
}

async function requireActiveAgencyMember(app: FastifyInstance, organizationId: string, userId: string) {
  const membership = await app.prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: { select: { status: true } } },
  });
  const now = new Date();
  if (
    !membership
    || membership.status !== 'ACTIVE'
    || membership.organization.status !== 'ACTIVE'
    || (membership.accessExpiresAt && membership.accessExpiresAt <= now)
  ) {
    throw new AppError({
      code: 'AGENCY_GRANTEE_NOT_ACTIVE',
      message: 'Получатель доступа должен быть активным участником агентства',
      statusCode: 409,
    });
  }
  return membership;
}

export async function createAgencyInvitation(
  app: FastifyInstance,
  actor: AgencyActor,
  input: InvitationInput,
) {
  if (input.clientOrganizationId === actor.organizationId) {
    throw new AppError({
      code: 'AGENCY_SELF_LINK_FORBIDDEN',
      message: 'Нельзя подключить текущее рабочее пространство как собственного клиента',
      statusCode: 409,
    });
  }

  const now = new Date();
  const permissions = normalizedDelegatedPermissions(input.permissions);
  const granteeUserId = input.granteeUserId ?? actor.userId;
  const grantExpiresAt = parseFutureDate(input.grantExpiresAt, now);

  const [clientOrganization] = await Promise.all([
    app.prisma.organization.findFirst({
      where: { id: input.clientOrganizationId, status: 'ACTIVE' },
      select: { id: true, name: true, slug: true },
    }),
    requireActiveAgencyMember(app, actor.organizationId, granteeUserId),
  ]);
  if (!clientOrganization) {
    throw new AppError({
      code: 'AGENCY_CLIENT_ORGANIZATION_NOT_FOUND',
      message: 'Клиентская организация не найдена',
      statusCode: 404,
    });
  }

  const liveLinks = await listAgencyClientLinks(app.prisma, actor.organizationId);
  if (liveLinks.some((link) => link.clientOrganizationId === input.clientOrganizationId)) {
    throw new AppError({
      code: 'AGENCY_CLIENT_ALREADY_LINKED',
      message: 'Клиент уже подключён к агентству',
      statusCode: 409,
    });
  }

  const token = createOpaqueToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(now.getTime() + INVITATION_TTL_MS);

  const invitation = await app.prisma.$transaction(async (tx) => {
    await revokePendingInvitations(tx, actor.organizationId, input.clientOrganizationId);
    const created = await createInvitation(tx, {
      agencyOrganizationId: actor.organizationId,
      clientOrganizationId: input.clientOrganizationId,
      granteeUserId,
      tokenHash,
      requestedPermissions: permissions,
      grantExpiresAt,
      createdByUserId: actor.userId,
      expiresAt,
    });
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'agency.invitation.created',
        entityType: 'agency_invitation',
        entityId: created.id,
        metadata: {
          clientOrganizationId: input.clientOrganizationId,
          granteeUserId,
          permissions,
          grantExpiresAt: grantExpiresAt?.toISOString() ?? null,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
    });
    return created;
  });

  return {
    invitation: {
      id: invitation.id,
      clientOrganizationId: invitation.clientOrganizationId,
      granteeUserId: invitation.granteeUserId,
      permissions,
      grantExpiresAt: invitation.grantExpiresAt?.toISOString() ?? null,
      status: invitation.status,
      expiresAt: invitation.expiresAt.toISOString(),
      createdAt: invitation.createdAt.toISOString(),
    },
    token,
    clientOrganization,
  };
}

export async function acceptAgencyInvitation(
  app: FastifyInstance,
  actor: AgencyActor,
  token: string,
) {
  const tokenHash = hashSessionToken(token);
  const invitation = await findInvitationByTokenHash(app.prisma, tokenHash);
  if (!invitation || invitation.clientOrganizationId !== actor.organizationId) {
    throw new AppError({
      code: 'AGENCY_INVITATION_NOT_FOUND',
      message: 'Приглашение не найдено для текущего рабочего пространства',
      statusCode: 404,
    });
  }
  if (invitation.status !== 'PENDING') {
    throw new AppError({
      code: 'AGENCY_INVITATION_NOT_PENDING',
      message: 'Приглашение уже недействительно',
      statusCode: 409,
    });
  }

  const now = new Date();
  if (invitation.expiresAt <= now) {
    await markInvitationExpired(app.prisma, invitation.id);
    throw new AppError({
      code: 'AGENCY_INVITATION_EXPIRED',
      message: 'Срок действия приглашения истёк',
      statusCode: 410,
    });
  }
  if (invitation.grantExpiresAt && invitation.grantExpiresAt <= now) {
    throw new AppError({
      code: 'AGENCY_GRANT_ALREADY_EXPIRED',
      message: 'Предложенный срок агентского доступа уже истёк',
      statusCode: 409,
    });
  }

  const permissions = sanitizeDelegatedPermissions(invitation.requestedPermissions);
  if (permissions.length === 0) {
    throw new AppError({
      code: 'AGENCY_INVITATION_SCOPE_INVALID',
      message: 'В приглашении отсутствуют допустимые права доступа',
      statusCode: 409,
    });
  }
  await requireActiveAgencyMember(app, invitation.agencyOrganizationId, invitation.granteeUserId);

  const result = await app.prisma.$transaction(async (tx) => {
    const accepted = await tx.$executeRaw`
      UPDATE "agency_invitations"
      SET
        "status" = 'ACCEPTED',
        "accepted_by_user_id" = CAST(${actor.userId} AS uuid),
        "accepted_at" = CURRENT_TIMESTAMP,
        "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = CAST(${invitation.id} AS uuid)
        AND "status" = 'PENDING'
    `;
    if (accepted !== 1) {
      throw new AppError({
        code: 'AGENCY_INVITATION_ALREADY_CONSUMED',
        message: 'Приглашение уже было использовано',
        statusCode: 409,
      });
    }

    const link = await upsertAgencyClientLink(tx, {
      agencyOrganizationId: invitation.agencyOrganizationId,
      clientOrganizationId: invitation.clientOrganizationId,
      acceptedByUserId: actor.userId,
    });
    const grant = await replaceLiveGrant(tx, {
      agencyClientLinkId: link.id,
      granteeUserId: invitation.granteeUserId,
      permissions,
      expiresAt: invitation.grantExpiresAt,
      createdByUserId: actor.userId,
    });

    await tx.auditLog.createMany({
      data: [
        {
          organizationId: invitation.clientOrganizationId,
          actorUserId: actor.userId,
          action: 'agency.invitation.accepted',
          entityType: 'agency_client_link',
          entityId: link.id,
          metadata: {
            agencyOrganizationId: invitation.agencyOrganizationId,
            granteeUserId: invitation.granteeUserId,
            permissions,
            grantId: grant.id,
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
        {
          organizationId: invitation.agencyOrganizationId,
          actorUserId: actor.userId,
          action: 'agency.client.linked',
          entityType: 'agency_client_link',
          entityId: link.id,
          metadata: {
            clientOrganizationId: invitation.clientOrganizationId,
            granteeUserId: invitation.granteeUserId,
            permissions,
            grantId: grant.id,
          },
          ipAddress: actor.ipAddress,
          userAgent: actor.userAgent,
        },
      ],
    });
    return { link, grant };
  });

  return {
    link: result.link,
    grant: {
      ...result.grant,
      permissions,
    },
  };
}

async function clientPortfolioSummary(app: FastifyInstance, organizationId: string) {
  const now = new Date();
  const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [organization, reviews, criticalCases, overdueTasks, sourceCount, activeSourceCount] = await Promise.all([
    app.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true, slug: true },
    }),
    app.prisma.review.aggregate({
      where: { organizationId, receivedAt: { gte: from } },
      _count: { _all: true },
      _avg: { rating: true },
    }),
    app.prisma.reputationCase.count({
      where: {
        organizationId,
        severity: 'CRITICAL',
        status: { notIn: ['RESOLVED', 'VERIFIED', 'CLOSED'] },
      },
    }),
    app.prisma.task.count({
      where: {
        organizationId,
        deadline: { lt: now },
        status: { notIn: ['DONE', 'ARCHIVED'] },
      },
    }),
    app.prisma.reviewSource.count({ where: { organizationId } }),
    app.prisma.reviewSource.count({ where: { organizationId, status: 'ACTIVE' } }),
  ]);

  const averageRating = reviews._avg.rating;
  const reputationScore = averageRating === null ? null : Math.round(averageRating * 20);
  const providerHealth = sourceCount === 0 ? null : Math.round((activeSourceCount / sourceCount) * 100);

  return {
    client: organization,
    period: { from: from.toISOString(), to: now.toISOString() },
    reputationScore,
    averageRating: averageRating === null ? null : Number(averageRating.toFixed(2)),
    reviewVolume: reviews._count._all,
    criticalCases,
    sla: {
      overdueTasks,
      status: overdueTasks === 0 ? 'ON_TRACK' : 'AT_RISK',
    },
    providerHealth: {
      score: providerHealth,
      activeSources: activeSourceCount,
      totalSources: sourceCount,
    },
  };
}

export async function agencyPortfolioOverview(app: FastifyInstance, actor: AgencyActor) {
  const agency = await app.prisma.organization.findFirst({
    where: { id: actor.organizationId, status: 'ACTIVE' },
    select: { id: true, name: true, slug: true },
  });
  if (!agency) {
    throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Организация не найдена', statusCode: 404 });
  }
  const links = await listAgencyClientLinks(app.prisma, actor.organizationId);
  const clients = await Promise.all(links.map(async (link) => ({
    link,
    ...(await clientPortfolioSummary(app, link.clientOrganizationId)),
  })));
  return { agency, clients };
}

export async function updateAgencyLink(
  app: FastifyInstance,
  actor: AgencyActor,
  linkId: string,
  status: 'ACTIVE' | 'PAUSED' | 'REVOKED',
) {
  const updated = await app.prisma.$transaction(async (tx) => {
    const link = await updateLinkStatus(tx, actor.organizationId, linkId, status);
    if (!link) {
      throw new AppError({
        code: 'AGENCY_CLIENT_LINK_NOT_FOUND',
        message: 'Связь с клиентом не найдена',
        statusCode: 404,
      });
    }
    await cascadeGrantStatusForLink(tx, link.id, status, actor.userId);
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: `agency.client.${status.toLowerCase()}`,
        entityType: 'agency_client_link',
        entityId: link.id,
        metadata: { clientOrganizationId: link.clientOrganizationId, status },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
    });
    return link;
  });
  return updated;
}

export async function revokeAgencyAccessFromClient(
  app: FastifyInstance,
  actor: AgencyActor,
  linkId: string,
) {
  return app.prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ id: string; agencyOrganizationId: string; clientOrganizationId: string }>>`
      UPDATE "agency_client_links"
      SET "status" = 'REVOKED', "revoked_at" = CURRENT_TIMESTAMP, "updated_at" = CURRENT_TIMESTAMP
      WHERE "id" = CAST(${linkId} AS uuid)
        AND "client_organization_id" = CAST(${actor.organizationId} AS uuid)
        AND "status" <> 'REVOKED'
      RETURNING
        "id",
        "agency_organization_id" AS "agencyOrganizationId",
        "client_organization_id" AS "clientOrganizationId"
    `;
    const link = rows[0];
    if (!link) {
      throw new AppError({
        code: 'AGENCY_CLIENT_LINK_NOT_FOUND',
        message: 'Активный агентский доступ не найден',
        statusCode: 404,
      });
    }
    await cascadeGrantStatusForLink(tx, link.id, 'REVOKED', actor.userId);
    await tx.auditLog.create({
      data: {
        organizationId: actor.organizationId,
        actorUserId: actor.userId,
        action: 'agency.access.revoked_by_client',
        entityType: 'agency_client_link',
        entityId: link.id,
        metadata: { agencyOrganizationId: link.agencyOrganizationId },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
    });
    return { ok: true, linkId: link.id };
  });
}

export async function delegatedWorkspaces(app: FastifyInstance, userId: string) {
  const workspaces = await listDelegatedWorkspaces(app.prisma, userId);
  return workspaces.map((workspace) => ({
    organization: {
      id: workspace.clientOrganizationId,
      name: workspace.clientName,
      slug: workspace.clientSlug,
    },
    agency: {
      id: workspace.agencyOrganizationId,
      name: workspace.agencyName,
    },
    access: {
      mode: 'DELEGATED' as const,
      grantId: workspace.grantId,
      linkId: workspace.linkId,
      permissions: workspace.permissions,
      expiresAt: workspace.expiresAt?.toISOString() ?? null,
    },
  }));
}

export async function selectDelegatedWorkspace(
  app: FastifyInstance,
  actor: Pick<AgencyActor, 'userId' | 'sessionId' | 'organizationId' | 'ipAddress' | 'userAgent'>,
  organizationId: string,
) {
  const now = new Date();
  const directMembership = await app.prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId: actor.userId } },
    include: { organization: { select: { status: true, name: true, slug: true } } },
  });
  if (
    directMembership
    && directMembership.status === 'ACTIVE'
    && directMembership.organization.status === 'ACTIVE'
    && (!directMembership.accessExpiresAt || directMembership.accessExpiresAt > now)
  ) {
    await app.prisma.session.update({ where: { id: actor.sessionId }, data: { activeOrganizationId: organizationId } });
    return {
      ok: true,
      workspace: {
        organizationId,
        accessMode: 'DIRECT' as const,
      },
    };
  }

  const access = await resolveDelegatedWorkspaceAccess(app.prisma, actor.userId, organizationId, now);
  if (!access) {
    throw new AppError({
      code: 'WORKSPACE_ACCESS_NOT_FOUND',
      message: 'Доступ к рабочему пространству не найден',
      statusCode: 404,
    });
  }

  await app.prisma.$transaction(async (tx) => {
    await tx.session.update({ where: { id: actor.sessionId }, data: { activeOrganizationId: organizationId } });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: actor.userId,
        action: 'agency.workspace.selected',
        entityType: 'delegated_access_grant',
        entityId: access.grantId,
        metadata: {
          agencyOrganizationId: access.agencyOrganizationId,
          linkId: access.linkId,
          permissions: access.permissions,
        },
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
      },
    });
  });

  return {
    ok: true,
    workspace: {
      organizationId,
      accessMode: 'DELEGATED' as const,
      agencyOrganizationId: access.agencyOrganizationId,
      grantId: access.grantId,
      linkId: access.linkId,
      permissions: access.permissions,
      expiresAt: access.expiresAt?.toISOString() ?? null,
    },
  };
}