import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { acceptAgencyInvitation, agencyPortfolioOverview, createAgencyInvitation, updateAgencyLink } from './agency.service.js';
import { agencyInvitationTokenParamsSchema, agencyLinkIdParamsSchema, createAgencyInvitationSchema, updateAgencyLinkSchema } from './agency.schemas.js';

function tenant(request: FastifyRequest) {
  if (!request.auth?.organizationId) throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  return { organizationId: request.auth.organizationId, userId: request.auth.userId };
}

export const agencyRoutes: FastifyPluginAsync = async (app) => {
  app.get('/agency/portfolio', { preHandler: [app.authenticate, app.authorize('agency.view')] }, async (request) => agencyPortfolioOverview(app, tenant(request)));

  app.post('/agency/invitations', { preHandler: [app.authenticate, app.authorize('agency.manage')] }, async (request, reply) => {
    const actor = tenant(request);
    const input = createAgencyInvitationSchema.parse(request.body);
    return reply.code(201).send(await createAgencyInvitation(app, actor, input.clientOrganizationId));
  });

  app.post('/agency/invitations/:token/accept', { preHandler: [app.authenticate, app.authorize('team.manage')] }, async (request) => {
    const actor = tenant(request);
    const { token } = agencyInvitationTokenParamsSchema.parse(request.params);
    return acceptAgencyInvitation(app, actor, token);
  });

  app.patch('/agency/clients/:linkId', { preHandler: [app.authenticate, app.authorize('agency.manage')] }, async (request) => {
    const actor = tenant(request);
    const { linkId } = agencyLinkIdParamsSchema.parse(request.params);
    const { status } = updateAgencyLinkSchema.parse(request.body);
    return { link: await updateAgencyLink(app, actor, linkId, status) };
  });
};
