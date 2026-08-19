import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import type { Permission } from '../rbac/permissions.js';

export const authorizationPlugin = fp(async (app) => {
  app.decorate('authorize', (permission: Permission) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!request.auth) {
        throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
      }
      if (!request.auth.organizationId || request.auth.accessMode === 'NONE') {
        throw new AppError({
          code: 'ORGANIZATION_CONTEXT_REQUIRED',
          message: 'Рабочее пространство ещё не выбрано',
          statusCode: 409,
        });
      }

      if (request.auth.accessMode === 'DIRECT') {
        if (!request.auth.membershipId || !request.auth.role) {
          throw new AppError({
            code: 'ORGANIZATION_CONTEXT_INVALID',
            message: 'Контекст прямого доступа к организации недействителен',
            statusCode: 409,
          });
        }
      } else if (request.auth.accessMode === 'DELEGATED') {
        if (
          !request.auth.agencyOrganizationId
          || !request.auth.delegatedGrantId
          || !request.auth.agencyClientLinkId
        ) {
          throw new AppError({
            code: 'DELEGATED_CONTEXT_INVALID',
            message: 'Контекст делегированного доступа недействителен',
            statusCode: 409,
          });
        }
      }

      if (!request.auth.permissions.includes(permission)) {
        throw new AppError({
          code: 'FORBIDDEN',
          message: 'Недостаточно прав для выполнения операции',
          statusCode: 403,
          details: { permission },
        });
      }
    };
  });
});
