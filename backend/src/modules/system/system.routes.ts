import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';

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
};
