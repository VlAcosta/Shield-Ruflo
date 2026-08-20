import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { getDashboardOverview, type DashboardOverviewAccess } from './dashboard.service.js';
import { enrichDashboardWithAnswerTimeline } from './dashboard-answer-timeline.service.js';
import {
  getPersistedDashboardLayout,
  resetPersistedDashboardLayout,
  savePersistedDashboardLayout,
} from './dashboard-layout.service.js';
import { saveDashboardLayoutSchema } from './dashboard-layout.schemas.js';

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

function requireUserId(request: FastifyRequest): string {
  const userId = request.auth?.userId;
  if (!userId) {
    throw new AppError({
      code: 'UNAUTHENTICATED',
      message: 'Требуется авторизация',
      statusCode: 401,
    });
  }
  return userId;
}

function overviewAccess(request: FastifyRequest): DashboardOverviewAccess {
  const permissions = new Set(request.auth?.permissions ?? []);
  return {
    analytics: permissions.has('analytics.view'),
    reviews: permissions.has('reviews.view'),
    tasks: permissions.has('tasks.view'),
    reports: permissions.has('reports.view'),
    team: permissions.has('team.view'),
    integrations: permissions.has('integrations.view'),
  };
}

export const dashboardRoutes: FastifyPluginAsync = async (app) => {
  app.get('/dashboard/overview', {
    preHandler: [app.authenticate, app.authorize('dashboard.view')],
  }, async (request) => {
    const organizationId = requireOrganizationId(request);
    const result = await getDashboardOverview(app, organizationId, overviewAccess(request));
    if (!result) {
      throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Организация не найдена', statusCode: 404 });
    }
    return enrichDashboardWithAnswerTimeline(app, organizationId, result);
  });

  app.get('/dashboard/reputation', {
    preHandler: [app.authenticate, app.authorize('analytics.view')],
  }, async (request) => {
    const access = overviewAccess(request);
    const result = await getDashboardOverview(app, requireOrganizationId(request), { ...access, analytics: true });
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

  app.get('/dashboard/layout', {
    preHandler: [app.authenticate, app.authorize('dashboard.view')],
  }, async (request) => getPersistedDashboardLayout(
    app,
    requireOrganizationId(request),
    requireUserId(request),
  ));

  app.put('/dashboard/layout', {
    preHandler: [app.authenticate, app.authorize('dashboard.edit')],
  }, async (request) => {
    const { layout } = saveDashboardLayoutSchema.parse(request.body);
    return savePersistedDashboardLayout(
      app,
      requireOrganizationId(request),
      requireUserId(request),
      layout,
    );
  });

  app.delete('/dashboard/layout', {
    preHandler: [app.authenticate, app.authorize('dashboard.edit')],
  }, async (request) => resetPersistedDashboardLayout(
    app,
    requireOrganizationId(request),
    requireUserId(request),
  ));
};
