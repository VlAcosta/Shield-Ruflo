import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import {
  acceptAgencyInvitation,
  agencyPortfolioOverview,
  createAgencyInvitation,
  delegatedWorkspaces,
  revokeAgencyAccessFromClient,
  selectDelegatedWorkspace,
  updateAgencyLink,
  type AgencyActor,
} from './agency.service.js';
import {
  agencyInvitationTokenParamsSchema,
  agencyLinkIdParamsSchema,
  createAgencyInvitationSchema,
  updateAgencyLinkSchema,
  workspaceOrganizationParamsSchema,
} from './agency.schemas.js';

function actor(request: FastifyRequest, options: { directOnly?: boolean } = {}): AgencyActor {
  if (!request.auth) {
    throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
  }
  if (!request.auth.organizationId) {
    throw new AppError({
      code: 'ORGANIZATION_CONTEXT_REQUIRED',
      message: 'Рабочее пространство не выбрано',
      statusCode: 409,
    });
  }
  if (options.directOnly && !request.auth.membershipId) {
    throw new AppError({
      code: 'DIRECT_MEMBERSHIP_REQUIRED',
      message: 'Операция доступна только прямому участнику организации',
      statusCode: 403,
    });
  }
  return {
    organizationId: request.auth.organizationId,
    userId: request.auth.userId,
    sessionId: request.auth.sessionId,
    ipAddress: request.ip,
    userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
  };
}

export const agencyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/agency/portfolio', {
    preHandler: [app.authenticate, app.authorize('agency.view')],
  }, async (request) => agencyPortfolioOverview(app, actor(request, { directOnly: true })));

  app.post('/agency/invitations', {
    preHandler: [app.authenticate, app.authorize('agency.manage')],
  }, async (request, reply) => {
    const input = createAgencyInvitationSchema.parse(request.body);
    const result = await createAgencyInvitation(app, actor(request, { directOnly: true }), input);
    return reply.code(201).send(result);
  });

  app.post('/agency/invitations/:token/accept', {
    preHandler: [app.authenticate, app.authorize('team.manage')],
  }, async (request) => {
    const { token } = agencyInvitationTokenParamsSchema.parse(request.params);
    return acceptAgencyInvitation(app, actor(request, { directOnly: true }), token);
  });

  app.patch('/agency/clients/:linkId', {
    preHandler: [app.authenticate, app.authorize('agency.manage')],
  }, async (request) => {
    const { linkId } = agencyLinkIdParamsSchema.parse(request.params);
    const { status } = updateAgencyLinkSchema.parse(request.body);
    return { link: await updateAgencyLink(app, actor(request, { directOnly: true }), linkId, status) };
  });

  app.post('/agency/client-access/:linkId/revoke', {
    preHandler: [app.authenticate, app.authorize('team.manage')],
  }, async (request) => {
    const { linkId } = agencyLinkIdParamsSchema.parse(request.params);
    return revokeAgencyAccessFromClient(app, actor(request, { directOnly: true }), linkId);
  });

  app.get('/agency/workspaces', { preHandler: app.authenticate }, async (request) => {
    if (!request.auth) {
      throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
    }
    return { workspaces: await delegatedWorkspaces(app, request.auth.userId) };
  });

  app.post('/agency/workspaces/:organizationId/select', { preHandler: app.authenticate }, async (request) => {
    if (!request.auth) {
      throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
    }
    const { organizationId } = workspaceOrganizationParamsSchema.parse(request.params);
    return selectDelegatedWorkspace(app, {
      organizationId: request.auth.organizationId ?? organizationId,
      userId: request.auth.userId,
      sessionId: request.auth.sessionId,
      ipAddress: request.ip,
      userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
    }, organizationId);
  });
};
