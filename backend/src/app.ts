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

export async function buildApp(): Promise<FastifyInstance> {
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
          '*.AUTH_SECRET',
          '*.AUTH_OTP_WEBHOOK_TOKEN',
        ],
        censor: '[REDACTED]',
      },
    },
    genReqId: () => crypto.randomUUID(),
    trustProxy: env.NODE_ENV === 'production',
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

  return app;
}
