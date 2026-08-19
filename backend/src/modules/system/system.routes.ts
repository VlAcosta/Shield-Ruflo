import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';
import { providerTruthMatrix } from '../integrations/providers/provider.truth.js';

export const systemRoutes: FastifyPluginAsync = async (app) => {
  app.get(
    '/meta',
    {
      schema: {
        tags: ['system'],
        response: {
          200: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              version: { type: 'string' },
              environment: { type: 'string' },
              apiVersion: { type: 'string' },
            },
          },
        },
      },
    },
    async () => ({
      name: env.APP_NAME,
      version: env.APP_VERSION,
      environment: env.NODE_ENV,
      apiVersion: 'v1',
    }),
  );

  // Public, credential-free product truth used by landing/pricing/integration UI.
  // It exposes only adapter capabilities/availability and never tenant data.
  app.get('/meta/providers', async () => ({
    providers: providerTruthMatrix(),
  }));
};
