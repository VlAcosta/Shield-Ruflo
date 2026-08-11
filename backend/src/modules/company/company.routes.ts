import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { companyLookupSchema, updateCompanyProfileSchema } from './company.schemas.js';
import { getCompanyProfile, lookupCompanyByInn, updateCompanyProfile } from './company.service.js';

export const companyRoutes: FastifyPluginAsync = async (app) => {
  app.post('/company/lookup', { preHandler: [app.authenticate, app.authorize('business.manage')] }, async (request) => {
    if (!request.auth?.organizationId) {
      throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
    }
    const { inn, kind = 'auto' } = companyLookupSchema.parse(request.body);
    return lookupCompanyByInn(inn, {
      organizationId: request.auth.organizationId,
      userId: request.auth.userId,
    }, kind);
  });

  app.get('/company/profile', {
    preHandler: [app.authenticate, app.authorize('business.view')],
  }, async (request) => {
    if (!request.auth?.organizationId) {
      throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
    }
    return getCompanyProfile(app, request.auth.organizationId);
  });

  app.patch('/company/profile', {
    preHandler: [app.authenticate, app.authorize('business.manage')],
  }, async (request) => {
    const body = updateCompanyProfileSchema.parse(request.body);
    return updateCompanyProfile(app, request, body);
  });
};
