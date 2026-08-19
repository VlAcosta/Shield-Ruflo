import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { env } from '../../config/env.js';
import { hashSessionToken } from '../../shared/security/tokens.js';
import { presentUser, publicUserInclude } from '../../modules/auth/auth.presenter.js';
import { readCookie, serializeClearedSessionCookie } from '../../shared/http/cookies.js';
import { effectivePermissions } from '../rbac/permissions.js';
import { resolveDelegatedWorkspaceAccess } from '../../modules/agency/agency.repository.js';

function readBearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (!authorization) return '';

  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' ? token?.trim() ?? '' : '';
}

function readSessionToken(request: FastifyRequest): string {
  return readBearerToken(request) || readCookie(request.headers.cookie, env.AUTH_COOKIE_NAME);
}

export function resolveActiveMembership<T extends { organizationId: string }>(
  memberships: readonly T[],
  selectedOrganizationId: string | null,
): T | null {
  if (selectedOrganizationId !== null) {
    return memberships.find((membership) => membership.organizationId === selectedOrganizationId) ?? null;
  }
  return null;
}

export const authenticationPlugin = fp(async (app) => {
  app.decorateRequest('auth', null);

  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const token = readSessionToken(request);
    if (!token) {
      throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
    }

    const tokenHash = hashSessionToken(token);
    const now = new Date();
    const session = await app.prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: publicUserInclude,
        },
      },
    });

    if (!session || session.revokedAt || session.expiresAt <= now || session.user.status !== 'ACTIVE') {
      reply.header('set-cookie', serializeClearedSessionCookie());
      throw new AppError({ code: 'SESSION_INVALID', message: 'Сессия недействительна или истекла', statusCode: 401 });
    }

    const usableMemberships = session.user.memberships.filter((membership) => (
      !membership.accessExpiresAt || membership.accessExpiresAt > now
    ));
    const directMembership = resolveActiveMembership(usableMemberships, session.activeOrganizationId);

    // Direct membership always wins. Delegated access is considered only when
    // the selected workspace is not a direct membership of the current user.
    const delegatedAccess = !directMembership && session.activeOrganizationId
      ? await resolveDelegatedWorkspaceAccess(app.prisma, session.userId, session.activeOrganizationId, now)
      : null;

    const resolvedOrganizationId = directMembership?.organizationId
      ?? delegatedAccess?.clientOrganizationId
      ?? null;
    if (resolvedOrganizationId !== session.activeOrganizationId) {
      await app.prisma.session.update({
        where: { id: session.id },
        data: { activeOrganizationId: resolvedOrganizationId },
      });
    }

    const accessMode = directMembership ? 'DIRECT' : delegatedAccess ? 'DELEGATED' : 'NONE';
    request.auth = {
      sessionId: session.id,
      tokenHash,
      userId: session.userId,
      organizationId: resolvedOrganizationId,
      membershipId: directMembership?.id ?? null,
      role: directMembership?.role ?? null,
      permissions: directMembership
        ? effectivePermissions(
            directMembership.role,
            directMembership.permissionOverrides as { allow?: string[]; deny?: string[] } | null,
          )
        : delegatedAccess?.permissions ?? [],
      accessMode,
      agencyOrganizationId: delegatedAccess?.agencyOrganizationId ?? null,
      delegatedGrantId: delegatedAccess?.grantId ?? null,
      agencyClientLinkId: delegatedAccess?.linkId ?? null,
      user: presentUser(session.user, resolvedOrganizationId),
    };

    const staleBefore = new Date(now.getTime() - 5 * 60 * 1000);
    if (!session.lastSeenAt || session.lastSeenAt < staleBefore) {
      void app.prisma.session
        .update({ where: { id: session.id }, data: { lastSeenAt: now } })
        .catch((error: unknown) => request.log.warn({ err: error }, 'Failed to update session lastSeenAt'));
    }
  });
});
