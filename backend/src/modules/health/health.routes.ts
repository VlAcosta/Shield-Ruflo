import type { FastifyPluginAsync } from 'fastify';
import { env } from '../../config/env.js';

const healthSchema = {
  tags: ['health'],
  response: {
    200: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        service: { type: 'string' },
        version: { type: 'string' },
        timestamp: { type: 'string' },
      },
    },
  },
};

export const healthRoutes: FastifyPluginAsync = async (app) => {
  const liveHandler = async () => ({
    status: 'ok',
    service: env.APP_NAME,
    version: env.APP_VERSION,
    timestamp: new Date().toISOString(),
  });

  app.get('/health', { schema: healthSchema }, liveHandler);
  app.get('/health/live', { schema: healthSchema }, liveHandler);

  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              database: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
          503: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              database: { type: 'string' },
              requestId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        await app.prisma.$queryRawUnsafe('SELECT 1');

        return {
          status: 'ready',
          database: 'up',
          timestamp: new Date().toISOString(),
        };
      } catch (error) {
        request.log.error({ err: error }, 'Database readiness probe failed');
        return reply.status(503).send({
          status: 'not_ready',
          database: 'down',
          requestId: request.id,
        });
      }
    },
  );
};
