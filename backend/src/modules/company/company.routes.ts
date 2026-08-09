import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { companyLookupSchema, updateCompanyProfileSchema } from './company.schemas.js';
import { getCompanyProfile, lookupCompanyByInn, updateCompanyProfile } from './company.service.js';

export const companyRoutes: FastifyPluginAsync = async (app) => {
  app.post('/company/lookup', { preHandler: app.authenticate }, async (request) => {
    const { inn } = companyLookupSchema.parse(request.body);
    return lookupCompanyByInn(inn);
  });

  app.get('/company/profile', {
    preHandler: [app.authenticate, app.authorize('company.view')],
  }, async (request) => {
    if (!request.auth?.organizationId) {
      throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
    }
    return getCompanyProfile(app, request.auth.organizationId);
  });

  app.patch('/company/profile', {
    preHandler: [app.authenticate, app.authorize('company.edit')],
  }, async (request) => {
    const body = updateCompanyProfileSchema.parse(request.body);
    return updateCompanyProfile(app, request, body);
  });
};
