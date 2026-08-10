import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { env } from '../../config/env.js';

export async function registerSecurity(app: FastifyInstance): Promise<void> {
  const allowedOrigins = new Set(env.CORS_ORIGINS);

  await app.register(helmet, {
    // Swagger UI needs its own browser assets in development. The production
    // JSON API can use a deny-by-default CSP because it serves no executable UI.
    contentSecurityPolicy: env.SWAGGER_ENABLED ? false : {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
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
