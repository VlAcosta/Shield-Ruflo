import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import {
  createInvitationSchema,
  invitationIdParamsSchema,
  invitationTokenParamsSchema,
  memberIdParamsSchema,
  memberSessionParamsSchema,
  updateMemberSchema,
  updateMemberSecuritySchema,
} from './team.schemas.js';
import {
  acceptTeamInvitation,
  createTeamInvitation,
  getTeamInvitationByToken,
  frontendRoleId,
  listTeamMembers,
  removeTeamMember,
  revokeInvitation,
  revokeMemberSessions,
  updateTeamMember,
} from './team.service.js';

export const teamRoutes: FastifyPluginAsync = async (app) => {
  app.get('/team', {
    preHandler: [app.authenticate, app.authorize('team.view')],
  }, async (request) => {
    const members = await listTeamMembers(app, request.auth!.organizationId!);
    return {
      members: members.filter((member) => member.invitationStatus !== 'pending').map((member) => ({
        id: member.id,
        email: member.email,
        status: member.securityStatus,
        accessExpiresAt: member.accessExpiresAt,
        frozenAt: member.frozenAt || null,
        frozenReason: member.frozenReason || '',
        forcedLogoutAt: null,
        sessionRevision: 0,
        sessions: member.sessions || [],
      })),
    };
  });

  app.get('/team/members', {
    preHandler: [app.authenticate, app.authorize('team.view')],
  }, async (request) => {
    return { members: await listTeamMembers(app, request.auth!.organizationId!) };
  });

  app.post('/team/invitations', {
    preHandler: [app.authenticate, app.authorize('team.manage')],
  }, async (request) => {
    const body = createInvitationSchema.parse(request.body);
    const accessExpiresAt = body.accessExpiresAt ?? body.access_expires_at;
    const permissionOverrides = body.permissionOverrides ?? body.permission_overrides;
    return createTeamInvitation(app, request, {
      name: body.name,
      email: body.email,
      role: body.accessRoleId ?? body.role,
      ...(accessExpiresAt !== undefined ? { accessExpiresAt } : {}),
      ...(permissionOverrides !== undefined ? { permissionOverrides } : {}),
    });
  });

  app.get('/team/invitations/:token', async (request) => {
    const { token } = invitationTokenParamsSchema.parse(request.params);
    const invitation = await getTeamInvitationByToken(app, token);
    return {
      invitation: {
        token,
        name: invitation.name || '',
        email: invitation.email,
        role: frontendRoleId(invitation.role),
        accessRoleId: frontendRoleId(invitation.role),
        status: 'pending',
        accessExpiresAt: invitation.accessExpiresAt?.toISOString() || null,
        permissionOverrides: (invitation.permissionOverrides as { allow?: string[]; deny?: string[] } | null) || { allow: [], deny: [] },
        company: {
          title: invitation.organization.name,
          inn: invitation.organization.inn || '',
          kpp: invitation.organization.kpp || '',
          ogrn: invitation.organization.ogrn || '',
          legalAddress: invitation.organization.legalAddress || '',
          verified: Boolean(invitation.organization.registryVerifiedAt),
        },
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
      },
    };
  });

  app.post('/team/invitations/:token/accept', { preHandler: app.authenticate }, async (request) => {
    if (!request.auth) throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
    const { token } = invitationTokenParamsSchema.parse(request.params);
    return acceptTeamInvitation(app, request, request.auth.userId, token);
  });

  app.delete('/team/invitations/:invitationId', {
    preHandler: [app.authenticate, app.authorize('team.manage')],
  }, async (request) => {
    const { invitationId } = invitationIdParamsSchema.parse(request.params);
    return revokeInvitation(app, request, invitationId);
  });

  app.patch('/team/members/:memberId', {
    preHandler: [app.authenticate, app.authorize('team.manage')],
  }, async (request) => {
    const { memberId } = memberIdParamsSchema.parse(request.params);
    const body = updateMemberSchema.parse(request.body);
    const role = body.accessRoleId ?? body.role;
    const securityStatus = body.securityStatus ?? body.status;
    const permissionOverrides = body.permissionOverrides ?? body.permission_overrides;
    return updateTeamMember(app, request, memberId, {
      ...(role !== undefined ? { role } : {}),
      ...(body.accessExpiresAt !== undefined ? { accessExpiresAt: body.accessExpiresAt } : {}),
      ...(securityStatus !== undefined ? { securityStatus } : {}),
      ...(body.frozenReason !== undefined ? { frozenReason: body.frozenReason } : {}),
      ...(permissionOverrides !== undefined ? { permissionOverrides } : {}),
    });
  });

  app.patch('/team/members/:memberId/security', {
    preHandler: [app.authenticate, app.authorize('team.manage')],
  }, async (request) => {
    const { memberId } = memberIdParamsSchema.parse(request.params);
    const body = updateMemberSecuritySchema.parse(request.body);
    const permissionOverrides = body.permissionOverrides ?? body.permission_overrides;
    const result = await updateTeamMember(app, request, memberId, {
      ...(body.status !== undefined ? { securityStatus: body.status } : {}),
      ...(body.accessExpiresAt !== undefined ? { accessExpiresAt: body.accessExpiresAt } : {}),
      ...(body.frozenReason !== undefined ? { frozenReason: body.frozenReason } : {}),
      ...(permissionOverrides !== undefined ? { permissionOverrides } : {}),
    });
    const member = result.member;
    return {
      security: {
        memberId: member.id,
        email: member.user.email || '',
        status: member.status === 'SUSPENDED' ? 'frozen' : 'active',
        frozenAt: member.suspendedAt?.toISOString() || null,
        frozenReason: member.suspendedReason || '',
        accessExpiresAt: member.accessExpiresAt?.toISOString() || null,
        forcedLogoutAt: null,
        sessionRevision: 0,
        sessions: [],
      },
    };
  });

  app.delete('/team/members/:memberId/sessions', {
    preHandler: [app.authenticate, app.authorize('team.manage')],
  }, async (request) => {
    const { memberId } = memberIdParamsSchema.parse(request.params);
    return revokeMemberSessions(app, request, memberId);
  });

  app.delete('/team/members/:memberId/sessions/:sessionId', {
    preHandler: [app.authenticate, app.authorize('team.manage')],
  }, async (request) => {
    const { memberId, sessionId } = memberSessionParamsSchema.parse(request.params);
    return revokeMemberSessions(app, request, memberId, sessionId);
  });

  app.delete('/team/members/:memberId', {
    preHandler: [app.authenticate, app.authorize('team.manage')],
  }, async (request) => {
    const { memberId } = memberIdParamsSchema.parse(request.params);
    return removeTeamMember(app, request, memberId);
  });
};
