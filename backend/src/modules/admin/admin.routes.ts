import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';

function normalizeIdentity(value: string | null | undefined): string {
  return String(value || '').trim().toLowerCase();
}

export const adminRoutes: FastifyPluginAsync = async (app) => {
  app.get('/admin/access', { preHandler: [app.authenticate] }, async (request) => {
    const user = await app.prisma.user.findUnique({
      where: { id: request.auth!.userId },
      select: { id: true, email: true, phone: true, status: true },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new AppError({
        code: 'PLATFORM_ADMIN_ACCESS_DENIED',
        message: 'Доступ к панели администратора запрещён',
        statusCode: 403,
      });
    }

    const identities = new Set([
      normalizeIdentity(user.email),
      normalizeIdentity(user.phone),
    ].filter(Boolean));

    const allowed = env.PLATFORM_ADMIN_IDENTITIES.length > 0
      && env.PLATFORM_ADMIN_IDENTITIES.some((identity) => identities.has(identity));

    if (!allowed) {
      request.log.warn({ userId: user.id }, 'Denied platform admin access');
      throw new AppError({
        code: 'PLATFORM_ADMIN_ACCESS_DENIED',
        message: 'Доступ к панели администратора запрещён',
        statusCode: 403,
      });
    }

    return { allowed: true };
  });
};
