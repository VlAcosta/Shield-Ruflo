import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import { env } from '../../config/env.js';
import { hashSessionToken } from '../../shared/security/tokens.js';
import { presentMembershipPermissions, presentUser, publicUserInclude } from '../../modules/auth/auth.presenter.js';
import { readCookie, serializeClearedSessionCookie } from '../../shared/http/cookies.js';

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
      // Remove a stale browser credential as part of the 401 response. This
      // avoids retry loops after expiry/revocation while preserving the same
      // generic error for unknown, revoked and expired sessions.
      reply.header('set-cookie', serializeClearedSessionCookie());
      throw new AppError({ code: 'SESSION_INVALID', message: 'Сессия недействительна или истекла', statusCode: 401 });
    }

    const usableMemberships = session.user.memberships.filter((membership) => (
      !membership.accessExpiresAt || membership.accessExpiresAt > now
    ));
    const activeMembership = resolveActiveMembership(usableMemberships, session.activeOrganizationId);

    const activeOrganizationId = activeMembership?.organizationId ?? null;
    if (activeOrganizationId !== session.activeOrganizationId) {
      await app.prisma.session.update({ where: { id: session.id }, data: { activeOrganizationId } });
    }

    request.auth = {
      sessionId: session.id,
      tokenHash,
      userId: session.userId,
      organizationId: activeOrganizationId,
      membershipId: activeMembership?.id ?? null,
      role: activeMembership?.role ?? null,
      permissions: activeMembership ? presentMembershipPermissions(activeMembership, now) : [],
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
