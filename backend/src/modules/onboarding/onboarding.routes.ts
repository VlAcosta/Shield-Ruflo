import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { completeOnboardingSchema, saveOnboardingStateSchema } from './onboarding.schemas.js';
import {
  completeOnboarding,
  getOnboardingState,
  saveOnboardingState,
  startOnboarding,
} from './onboarding.service.js';

export const onboardingRoutes: FastifyPluginAsync = async (app) => {
  app.get('/onboarding/state', { preHandler: [app.authenticate, app.authorize('business.view')] }, async (request) => {
    if (!request.auth?.organizationId) {
      throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
    }
    return getOnboardingState(app, request.auth.organizationId);
  });

  app.post('/onboarding/start', { preHandler: [app.authenticate, app.authorize('business.manage')] }, async (request) => {
    if (!request.auth?.organizationId) {
      throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
    }
    return startOnboarding(app, request.auth.organizationId);
  });

  app.patch('/onboarding/state', { preHandler: [app.authenticate, app.authorize('business.manage')] }, async (request) => {
    if (!request.auth?.organizationId) {
      throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
    }
    const body = saveOnboardingStateSchema.parse(request.body);
    return saveOnboardingState(app, request.auth.organizationId, body);
  });

  app.post('/onboarding/complete', { preHandler: [app.authenticate, app.authorize('business.manage')] }, async (request) => {
    const body = completeOnboardingSchema.parse(request.body);
    return completeOnboarding(app, request, body);
  });
};
