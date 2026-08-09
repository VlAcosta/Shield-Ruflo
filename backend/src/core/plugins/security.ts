import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from '../../config/env.js';

export async function registerSecurity(app: FastifyInstance): Promise<void> {
  const allowedOrigins = new Set(env.CORS_ORIGINS);

  await app.register(helmet, {
    contentSecurityPolicy: false,
  });

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error('Origin is not allowed by CORS'), false);
    },
  });
}
