import crypto from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import { env } from './config/env.js';
import { databasePlugin } from './core/plugins/database.js';
import { authenticationPlugin } from './core/plugins/authentication.js';
import { authorizationPlugin } from './core/plugins/authorization.js';
import { registerErrorHandler } from './core/plugins/error-handler.js';
import { registerOpenApi } from './core/plugins/openapi.js';
import { registerSecurity } from './core/plugins/security.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { meRoutes } from './modules/me/me.routes.js';
import { organizationRoutes } from './modules/organizations/organization.routes.js';
import { onboardingRoutes } from './modules/onboarding/onboarding.routes.js';
import { companyRoutes } from './modules/company/company.routes.js';
import { systemRoutes } from './modules/system/system.routes.js';
import { profileRoutes } from './modules/profile/profile.routes.js';
import { teamRoutes } from './modules/team/team.routes.js';
import { reviewsRoutes } from './modules/reviews/reviews.routes.js';
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.js';
import { tasksRoutes } from './modules/tasks/tasks.routes.js';
import { integrationsRoutes } from './modules/integrations/integrations.routes.js';
import { googleBusinessProfileRoutes } from './modules/integrations/providers/google/google-business-profile.routes.js';
import { registerGoogleBusinessProfileProvider } from './modules/integrations/providers/google/index.js';
import { operationsRoutes } from './modules/operations/operations.routes.js';
import { casesRoutes } from './modules/cases/cases.routes.js';
import { acquisitionRoutes } from './modules/acquisition/acquisition.routes.js';
import { competitiveRoutes } from './modules/competitive/competitive.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { reviewIntelligenceRoutes } from './modules/ai/review-intelligence.routes.js';
import { replyCopilotRoutes } from './modules/ai/reply-copilot.routes.js';
import { registerAiProviders } from './modules/ai/providers/index.js';

export async function buildApp(): Promise<FastifyInstance> {
  registerGoogleBusinessProfileProvider();
  registerAiProviders();

  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          '*.password',
          '*.token',
          '*.code',
          '*.credentials',
          '*.encryptedValue',
          '*.AUTH_SECRET',
          '*.AUTH_OTP_WEBHOOK_TOKEN',
          '*.COMPANY_LOOKUP_WEBHOOK_TOKEN',
          '*.INTEGRATION_CREDENTIALS_KEY',
          '*.GOOGLE_BUSINESS_CLIENT_SECRET',
          '*.AI_OPENAI_API_KEY',
          '*.refreshToken',
          '*.accessToken',
        ],
        censor: '[REDACTED]',
      },
    },
    genReqId: () => crypto.randomUUID(),
    trustProxy: env.TRUST_PROXY,
  });

  registerErrorHandler(app);

  await app.register(sensible);
  await registerSecurity(app);
  await registerOpenApi(app);
  await app.register(databasePlugin);
  await app.register(authenticationPlugin);
  await app.register(authorizationPlugin);

  await app.register(healthRoutes);
  await app.register(systemRoutes, { prefix: '/api/v1' });
  await app.register(authRoutes, { prefix: '/api/v1' });
  await app.register(meRoutes, { prefix: '/api/v1' });
  await app.register(organizationRoutes, { prefix: '/api/v1' });
  await app.register(onboardingRoutes, { prefix: '/api/v1' });
  await app.register(companyRoutes, { prefix: '/api/v1' });
  await app.register(profileRoutes, { prefix: '/api/v1' });
  await app.register(teamRoutes, { prefix: '/api/v1' });
  await app.register(reviewsRoutes, { prefix: '/api/v1' });
  await app.register(reviewIntelligenceRoutes, { prefix: '/api/v1' });
  await app.register(replyCopilotRoutes, { prefix: '/api/v1' });
  await app.register(dashboardRoutes, { prefix: '/api/v1' });
  await app.register(tasksRoutes, { prefix: '/api/v1' });
  await app.register(casesRoutes, { prefix: '/api/v1' });
  await app.register(acquisitionRoutes, { prefix: '/api/v1' });
  await app.register(competitiveRoutes, { prefix: '/api/v1' });
  await app.register(integrationsRoutes, { prefix: '/api/v1' });
  await app.register(googleBusinessProfileRoutes, { prefix: '/api/v1' });
  await app.register(operationsRoutes, { prefix: '/api/v1' });
  await app.register(billingRoutes, { prefix: '/api/v1' });
  await app.register(adminRoutes, { prefix: '/api/v1' });

  return app;
}
