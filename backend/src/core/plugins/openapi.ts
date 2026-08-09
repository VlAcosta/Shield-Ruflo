import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { env } from '../../config/env.js';

export async function registerOpenApi(app: FastifyInstance): Promise<void> {
  if (!env.SWAGGER_ENABLED) return;

  await app.register(swagger, {
    openapi: {
      info: {
        title: env.APP_NAME,
        description: 'Business Shield backend API',
        version: env.APP_VERSION,
      },
      tags: [
        { name: 'health', description: 'Liveness and readiness probes' },
        { name: 'system', description: 'API metadata' },
        { name: 'auth', description: 'OTP authentication and server-side sessions' },
        { name: 'me', description: 'Current authenticated user' },
        { name: 'organizations', description: 'Tenant organization context and businesses' },
        { name: 'onboarding', description: 'Server-owned onboarding state' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'opaque',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });
}
