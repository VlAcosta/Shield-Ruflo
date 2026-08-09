import type { FastifyPluginAsync } from 'fastify';
import { sessionIdParamsSchema, updatePersonalProfileSchema } from './profile.schemas.js';
import { memberIdParamsSchema, updateMemberSchema } from '../team/team.schemas.js';
import { removeTeamMember, updateTeamMember } from '../team/team.service.js';
import {
  getProfileSnapshot,
  revokeOtherOwnSessions,
  revokeOwnSession,
  updatePersonalProfile,
} from './profile.service.js';

export const profileRoutes: FastifyPluginAsync = async (app) => {
  app.get('/profile', { preHandler: app.authenticate }, async (request) => getProfileSnapshot(app, request));

  app.patch('/profile/personal', { preHandler: app.authenticate }, async (request) => {
    const body = updatePersonalProfileSchema.parse(request.body);
    return updatePersonalProfile(app, request, {
      ...(body.firstName !== undefined ? { firstName: body.firstName } : {}),
      ...(body.lastName !== undefined ? { lastName: body.lastName } : {}),
      ...(body.email !== undefined ? { email: body.email } : {}),
      ...(body.phone !== undefined ? { phone: body.phone } : {}),
      ...(body.position !== undefined ? { position: body.position } : {}),
      ...(body.telegram !== undefined ? { telegram: body.telegram } : {}),
      ...(body.avatar !== undefined ? { avatar: body.avatar } : {}),
    });
  });

  app.delete('/profile/sessions/:sessionId', { preHandler: app.authenticate }, async (request) => {
    const { sessionId } = sessionIdParamsSchema.parse(request.params);
    return revokeOwnSession(app, request, sessionId);
  });

  app.delete('/profile/sessions', { preHandler: app.authenticate }, async (request) => revokeOtherOwnSessions(app, request));

  app.patch('/profile/users/:memberId', {
    preHandler: [app.authenticate, app.authorize('team.manage_roles')],
  }, async (request) => {
    const { memberId } = memberIdParamsSchema.parse(request.params);
    const body = updateMemberSchema.parse(request.body);
    const role = body.accessRoleId ?? body.role;
    const securityStatus = body.securityStatus ?? body.status;
    const permissionOverrides = body.permissionOverrides ?? body.permission_overrides;
    await updateTeamMember(app, request, memberId, {
      ...(role !== undefined ? { role } : {}),
      ...(body.accessExpiresAt !== undefined ? { accessExpiresAt: body.accessExpiresAt } : {}),
      ...(securityStatus !== undefined ? { securityStatus } : {}),
      ...(body.frozenReason !== undefined ? { frozenReason: body.frozenReason } : {}),
      ...(permissionOverrides !== undefined ? { permissionOverrides } : {}),
    });
    return getProfileSnapshot(app, request);
  });

  app.delete('/profile/users/:memberId', {
    preHandler: [app.authenticate, app.authorize('team.remove')],
  }, async (request) => {
    const { memberId } = memberIdParamsSchema.parse(request.params);
    await removeTeamMember(app, request, memberId);
    return getProfileSnapshot(app, request);
  });
};
