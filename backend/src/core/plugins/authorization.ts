import fp from 'fastify-plugin';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../errors/app-error.js';
import {
  effectivePermissions,
  entitlementForPermission,
  type Permission,
} from '../rbac/permissions.js';

export const authorizationPlugin = fp(async (app) => {
  app.decorate('authorize', (permission: Permission) => {
    return async (request: FastifyRequest, _reply: FastifyReply) => {
      if (!request.auth) {
        throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
      }
      if (!request.auth.organizationId || !request.auth.membershipId || !request.auth.role) {
        throw new AppError({
          code: 'ORGANIZATION_CONTEXT_REQUIRED',
          message: 'Рабочее пространство ещё не выбрано',
          statusCode: 409,
        });
      }
      if (!request.auth.permissions.includes(permission)) {
        const rolePermissions = effectivePermissions(
          request.auth.role,
          request.auth.user.membership?.permissionOverrides ?? null,
        );
        const entitlement = rolePermissions.includes(permission)
          ? entitlementForPermission(permission)
          : null;

        if (entitlement) {
          throw new AppError({
            code: 'ENTITLEMENT_REQUIRED',
            message: 'Функция недоступна на текущем тарифе',
            statusCode: 403,
            details: { permission, entitlement },
          });
        }

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
