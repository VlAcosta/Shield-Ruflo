import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: app.authenticate }, async (request) => {
    if (!request.auth) {
      throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
    }
    return {
      user: request.auth.user,
      organizationContext: request.auth.organizationId
        ? {
            organizationId: request.auth.organizationId,
            membershipId: request.auth.membershipId,
            role: request.auth.role,
            permissions: request.auth.permissions,
            accessMode: request.auth.accessMode,
            agencyOrganizationId: request.auth.agencyOrganizationId,
            delegatedGrantId: request.auth.delegatedGrantId,
            agencyClientLinkId: request.auth.agencyClientLinkId,
          }
        : null,
    };
  });
};
