import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { env } from '../../config/env.js';
import { hashSessionToken } from '../../shared/security/tokens.js';
import { presentUser, publicUserInclude } from '../../modules/auth/auth.presenter.js';
import { readCookie } from '../../shared/http/cookies.js';
import { effectivePermissions } from '../rbac/permissions.js';

function readBearerToken(request: FastifyRequest): string {
  const authorization = request.headers.authorization;
  if (!authorization) return '';

  const [scheme, token] = authorization.split(/\s+/, 2);
  return scheme?.toLowerCase() === 'bearer' ? token?.trim() ?? '' : '';
}

function readSessionToken(request: FastifyRequest): string {
  return readBearerToken(request) || readCookie(request.headers.cookie, env.AUTH_COOKIE_NAME);
}

export const authenticationPlugin = fp(async (app) => {
  app.decorateRequest('auth', null);

  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
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
      throw new AppError({ code: 'SESSION_INVALID', message: 'Сессия недействительна или истекла', statusCode: 401 });
    }

    const usableMemberships = session.user.memberships.filter((membership) => (
      !membership.accessExpiresAt || membership.accessExpiresAt > now
    ));
    const activeMembership = usableMemberships.find((membership) => (
      membership.organizationId === session.activeOrganizationId
    )) ?? usableMemberships[0] ?? null;

    const activeOrganizationId = activeMembership?.organizationId ?? null;
    if (activeOrganizationId && activeOrganizationId !== session.activeOrganizationId) {
      void app.prisma.session
        .update({ where: { id: session.id }, data: { activeOrganizationId } })
        .catch((error: unknown) => request.log.warn({ err: error }, 'Failed to repair active organization context'));
    }

    request.auth = {
      sessionId: session.id,
      tokenHash,
      userId: session.userId,
      organizationId: activeOrganizationId,
      membershipId: activeMembership?.id ?? null,
      role: activeMembership?.role ?? null,
      permissions: activeMembership ? effectivePermissions(activeMembership.role, activeMembership.permissionOverrides as { allow?: string[]; deny?: string[] } | null) : [],
      user: presentUser(session.user, activeOrganizationId),
    };

    const staleBefore = new Date(now.getTime() - 5 * 60 * 1000);
    if (!session.lastSeenAt || session.lastSeenAt < staleBefore) {
      void app.prisma.session
        .update({ where: { id: session.id }, data: { lastSeenAt: now } })
        .catch((error: unknown) => request.log.warn({ err: error }, 'Failed to update session lastSeenAt'));
    }
  });
});
