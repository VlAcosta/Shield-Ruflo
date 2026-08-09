import 'fastify';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '../generated/prisma/client.js';
import type { AuthContext } from '../modules/auth/auth.types.js';
import type { Permission } from '../core/rbac/permissions.js';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    authorize: (permission: Permission) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }

  interface FastifyRequest {
    auth: AuthContext | null;
  }
}
