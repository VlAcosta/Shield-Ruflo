import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';
import { serializeClearedSessionCookie, serializeSessionCookie } from '../../shared/http/cookies.js';
import {
  completeUserProfile,
  requestVerificationCode,
  revokeAllUserSessions,
  revokeToken,
  tokenFromRequest,
  verifyVerificationCode,
} from './auth.service.js';
import { completeProfileSchema, requestCodeSchema, verifyCodeSchema } from './auth.schemas.js';

function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.header('set-cookie', serializeSessionCookie(token, env.AUTH_SESSION_TTL_SECONDS));
}

function clearSessionCookie(reply: FastifyReply): void {
  reply.header('set-cookie', serializeClearedSessionCookie());
}

export const authRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/auth/request-code',
    async (request) => {
      const body = requestCodeSchema.parse(request.body);
      return requestVerificationCode(app, request, {
        phone: body.phone,
        mode: body.mode,
        ...(body.invitation_token !== undefined ? { invitationToken: body.invitation_token } : {}),
      });
    },
  );

  app.post(
    '/auth/verify-code',
    async (request, reply) => {
      const body = verifyCodeSchema.parse(request.body);
      const result = await verifyVerificationCode(app, request, {
        phone: body.phone,
        code: body.code,
        sessionId: body.session_id,
        mode: body.mode,
        ...(body.invitation_token !== undefined ? { invitationToken: body.invitation_token } : {}),
      });
      setSessionCookie(reply, result.token);
      return result;
    },
  );

  app.post(
    '/auth/complete-profile',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const body = completeProfileSchema.parse(request.body);
      if (!request.auth) {
        throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
      }
      const result = await completeUserProfile(app, request, request.auth, {
        phone: body.phone,
        firstName: body.first_name,
        lastName: body.last_name,
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.tariff !== undefined ? { tariff: body.tariff } : {}),
        ...(body.invitation_token ? { invitationToken: body.invitation_token } : {}),
      });
      setSessionCookie(reply, result.token);
      return result;
    },
  );


  app.post('/auth/login', async (request, reply) => {
    const body = verifyCodeSchema.parse(request.body);
    const result = await verifyVerificationCode(app, request, {
      phone: body.phone,
      code: body.code,
      sessionId: body.session_id,
      mode: 'login',
    });
    setSessionCookie(reply, result.token);
    return result;
  });

  app.post(
    '/auth/register',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const body = completeProfileSchema.parse(request.body);
      if (!request.auth) {
        throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
      }
      const result = await completeUserProfile(app, request, request.auth, {
        phone: body.phone,
        firstName: body.first_name,
        lastName: body.last_name,
        ...(body.email !== undefined ? { email: body.email } : {}),
        ...(body.tariff !== undefined ? { tariff: body.tariff } : {}),
        ...(body.invitation_token ? { invitationToken: body.invitation_token } : {}),
      });
      setSessionCookie(reply, result.token);
      return result;
    },
  );

  app.get('/auth/session', { preHandler: app.authenticate }, async (request) => {
    if (!request.auth) {
      throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
    }
    return { ok: true, user: request.auth.user };
  });

  app.post('/auth/logout', async (request, reply) => {
    await revokeToken(app, tokenFromRequest(request));
    clearSessionCookie(reply);
    return reply.status(204).send();
  });

  app.post('/auth/logout-all', { preHandler: app.authenticate }, async (request, reply) => {
    if (!request.auth) {
      throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
    }
    const revoked = await revokeAllUserSessions(app, request.auth.userId);
    clearSessionCookie(reply);
    return { ok: true, revoked };
  });
};
