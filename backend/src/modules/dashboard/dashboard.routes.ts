import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { getDashboardOverview } from './dashboard.service.js';

function requireOrganizationId(request: FastifyRequest): string {
  const organizationId = request.auth?.organizationId;
  if (!organizationId) {
    throw new AppError({
      code: 'ORGANIZATION_CONTEXT_REQUIRED',
      message: 'Рабочее пространство не выбрано',
      statusCode: 409,
    });
  }
  return organizationId;
}

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dashboard/overview', {
    preHandler: [app.authenticate, app.authorize('dashboard.view')],
  }, async (request) => {
    const result = await getDashboardOverview(app, requireOrganizationId(request));
    if (!result) {
      throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Организация не найдена', statusCode: 404 });
    }
    return result;
  });

  app.get('/dashboard/reputation', {
    preHandler: [app.authenticate, app.authorize('analytics.view')],
  }, async (request) => {
    const result = await getDashboardOverview(app, requireOrganizationId(request));
    if (!result) {
      throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Организация не найдена', statusCode: 404 });
    }
    return {
      generatedAt: result.generatedAt,
      timezone: result.timezone,
      measured: result.measured,
      dataAvailability: result.dataAvailability,
      pulse: result.pulse,
      reputation: result.reputation,
    };
  });
};
