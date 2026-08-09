import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { effectivePermissions, type PermissionOverrides } from '../../core/rbac/permissions.js';
import { createOpaqueToken, hashSessionToken } from '../../shared/security/tokens.js';

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const ONLINE_WINDOW_MS = 4 * 60 * 1000;

export type OrganizationRoleValue = 'OWNER' | 'ADMIN' | 'MANAGER' | 'ANALYST' | 'MEMBER';

const roleAliases: Record<string, OrganizationRoleValue> = {
  OWNER: 'OWNER',
  ADMIN: 'ADMIN',
  MANAGER: 'MANAGER',
  MODERATOR: 'MANAGER',
  ANALYST: 'ANALYST',
  MEMBER: 'MEMBER',
  GUEST: 'ANALYST',
};

const frontendRole: Record<OrganizationRoleValue, string> = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MANAGER: 'moderator',
  ANALYST: 'guest',
  MEMBER: 'guest',
};

function auditContext(request: FastifyRequest) {
  return {
    ipAddress: request.ip,
    userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
  };
}

export function normalizeOrganizationRole(value: string | undefined | null): OrganizationRoleValue {
  const normalized = String(value || 'MEMBER').trim().toUpperCase();
  const role = roleAliases[normalized];
  if (!role) {
    throw new AppError({ code: 'INVALID_ROLE', message: 'Неизвестная роль команды', statusCode: 400 });
  }
  return role;
}

export function frontendRoleId(value: string): string {
  const normalized = String(value || 'MEMBER').toUpperCase() as OrganizationRoleValue;
  return frontendRole[normalized] || 'guest';
}

function parseOptionalDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value) return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new AppError({ code: 'INVALID_DATE', message: 'Некорректная дата ограничения доступа', statusCode: 400 });
  }
  return parsed;
}

function memberName(user: { firstName: string | null; lastName: string | null; displayName: string | null; email: string | null }) {
  return user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Пользователь';
}

function initials(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || '').join('') || 'П';
}

function sessionLabel(userAgent: string | null) {
  const ua = userAgent || '';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome'
        : /Safari\//.test(ua) ? 'Safari'
          : 'Браузер';
  const os = /Windows/.test(ua) ? 'Windows'
    : /Mac OS X/.test(ua) ? 'macOS'
      : /Android/.test(ua) ? 'Android'
        : /iPhone|iPad/.test(ua) ? 'iOS'
          : 'Устройство';
  const deviceType = /Mobile|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop';
  return { browser, os, deviceType, label: `${browser} · ${os}` };
}

async function assertCanTouchOwner(app: FastifyInstance, organizationId: string, actorRole: string | null, targetRole: string) {
  if (targetRole === 'OWNER' && actorRole !== 'OWNER') {
    throw new AppError({ code: 'OWNER_PROTECTED', message: 'Изменять владельца может только владелец организации', statusCode: 403 });
  }
  if (targetRole !== 'OWNER') return;
  const ownerCount = await app.prisma.organizationMember.count({
    where: { organizationId, role: 'OWNER', status: 'ACTIVE' },
  });
  if (ownerCount <= 1) {
    throw new AppError({ code: 'LAST_OWNER_REQUIRED', message: 'В организации должен оставаться хотя бы один активный владелец', statusCode: 409 });
  }
}

export async function listTeamMembers(app: FastifyInstance, organizationId: string) {
  const now = Date.now();
  const [memberships, invitations] = await Promise.all([
    app.prisma.organizationMember.findMany({
      where: { organizationId },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: {
        user: {
          include: {
            sessions: {
              where: { activeOrganizationId: organizationId, revokedAt: null, expiresAt: { gt: new Date() } },
              orderBy: { lastSeenAt: 'desc' },
              take: 12,
            },
          },
        },
      },
    }),
    app.prisma.teamInvitation.findMany({
      where: { organizationId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const members = memberships.map((membership) => {
    const name = memberName(membership.user);
    const sessions = membership.user.sessions.map((session) => {
      const device = sessionLabel(session.userAgent);
      return {
        id: session.id,
        deviceType: device.deviceType,
        browser: device.browser,
        os: device.os,
        label: device.label,
        ip: session.ipAddress || '',
        location: '',
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt?.toISOString() || session.createdAt.toISOString(),
        revokedAt: session.revokedAt?.toISOString() || null,
      };
    });
    const latestSeen = membership.user.sessions[0]?.lastSeenAt || membership.user.lastLoginAt;
    return {
      id: membership.id,
      userId: membership.userId,
      initials: initials(name),
      name,
      subtitle: membership.status === 'SUSPENDED' ? 'Доступ приостановлен' : 'Участник команды',
      email: membership.user.email || '',
      phone: membership.user.phone,
      role: frontendRole[membership.role as OrganizationRoleValue] || 'guest',
      backendRole: membership.role,
      accessRoleId: frontendRole[membership.role as OrganizationRoleValue] || 'guest',
      permissions: effectivePermissions(membership.role, membership.permissionOverrides as PermissionOverrides | null),
      permissionOverrides: (membership.permissionOverrides as PermissionOverrides | null) || { allow: [], deny: [] },
      accessExpiresAt: membership.accessExpiresAt?.toISOString() || null,
      securityStatus: membership.status === 'SUSPENDED' ? 'frozen' : 'active',
      frozenAt: membership.suspendedAt?.toISOString() || null,
      frozenReason: membership.suspendedReason || '',
      active: membership.status === 'ACTIVE',
      online: Boolean(latestSeen && now - latestSeen.getTime() <= ONLINE_WINDOW_MS && membership.status === 'ACTIVE'),
      invitationStatus: 'accepted',
      joinedAt: membership.joinedAt?.toISOString() || membership.createdAt.toISOString(),
      lastLoginAt: membership.user.lastLoginAt?.toISOString() || null,
      lastSeenAt: latestSeen?.toISOString() || null,
      sessions,
    };
  });

  const pending = invitations.map((invitation) => ({
    id: `invite-${invitation.id}`,
    invitationId: invitation.id,
    initials: initials(invitation.name || invitation.email),
    name: invitation.name || invitation.email,
    subtitle: 'Ожидает принятия приглашения',
    email: invitation.email,
    role: frontendRole[invitation.role as OrganizationRoleValue] || 'guest',
    backendRole: invitation.role,
    accessRoleId: frontendRole[invitation.role as OrganizationRoleValue] || 'guest',
    permissionOverrides: (invitation.permissionOverrides as PermissionOverrides | null) || { allow: [], deny: [] },
    accessExpiresAt: invitation.accessExpiresAt?.toISOString() || null,
    securityStatus: 'active',
    frozenAt: null,
    frozenReason: '',
    active: false,
    online: false,
    invitationStatus: 'pending',
    invitedAt: invitation.createdAt.toISOString(),
    invitationExpiresAt: invitation.expiresAt.toISOString(),
    sessions: [],
  }));

  return [...members, ...pending];
}

export async function createTeamInvitation(
  app: FastifyInstance,
  request: FastifyRequest,
  input: { name: string; email: string; role: string; accessExpiresAt?: string | null; permissionOverrides?: PermissionOverrides },
) {
  if (!request.auth?.organizationId || !request.auth.role) {
    throw new AppError({ code: 'ORGANIZATION_CONTEXT_REQUIRED', message: 'Рабочее пространство не выбрано', statusCode: 409 });
  }
  const organizationId = request.auth.organizationId;
  const role = normalizeOrganizationRole(input.role);
  if (role === 'OWNER' && request.auth.role !== 'OWNER') {
    throw new AppError({ code: 'OWNER_ROLE_RESTRICTED', message: 'Пригласить владельца может только текущий владелец', statusCode: 403 });
  }
  const email = input.email.trim().toLowerCase();
  const accessExpiresAt = parseOptionalDate(input.accessExpiresAt);
  if (accessExpiresAt && accessExpiresAt <= new Date()) {
    throw new AppError({ code: 'ACCESS_EXPIRY_INVALID', message: 'Срок доступа должен быть в будущем', statusCode: 400 });
  }

  const existingMember = await app.prisma.organizationMember.findFirst({
    where: { organizationId, user: { email } },
    select: { id: true },
  });
  if (existingMember) {
    throw new AppError({ code: 'MEMBER_ALREADY_EXISTS', message: 'Пользователь с этим email уже состоит в команде', statusCode: 409 });
  }

  const token = createOpaqueToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const invitation = await app.prisma.$transaction(async (tx) => {
    await tx.teamInvitation.updateMany({
      where: { organizationId, email, status: 'PENDING' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    return tx.teamInvitation.create({
      data: {
        organizationId,
        createdByUserId: request.auth!.userId,
        email,
        name: input.name.trim(),
        role,
        tokenHash,
        accessExpiresAt: accessExpiresAt ?? null,
        permissionOverrides: input.permissionOverrides || { allow: [], deny: [] },
        expiresAt,
      },
      include: { organization: true },
    });
  });

  await app.prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: request.auth.userId,
      action: 'team.invitation.created',
      entityType: 'team_invitation',
      entityId: invitation.id,
      metadata: { email, role, expiresAt: expiresAt.toISOString() },
      ...auditContext(request),
    },
  });

  return {
    invitation: {
      id: invitation.id,
      token,
      name: invitation.name || '',
      email: invitation.email,
      role: frontendRole[role],
      accessRoleId: frontendRole[role],
      status: 'pending',
      accessExpiresAt: invitation.accessExpiresAt?.toISOString() || null,
      permissionOverrides: (invitation.permissionOverrides as PermissionOverrides | null) || { allow: [], deny: [] },
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
}

export async function getTeamInvitationByToken(app: FastifyInstance, token: string) {
  const invitation = await app.prisma.teamInvitation.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { organization: true },
  });
  if (!invitation) throw new AppError({ code: 'INVITATION_NOT_FOUND', message: 'Приглашение не найдено или уже недоступно', statusCode: 404 });
  if (invitation.status === 'ACCEPTED') throw new AppError({ code: 'INVITATION_ACCEPTED', message: 'Это приглашение уже использовано', statusCode: 409 });
  if (invitation.status === 'REVOKED') throw new AppError({ code: 'INVITATION_REVOKED', message: 'Приглашение было отозвано', statusCode: 410 });
  if (invitation.expiresAt <= new Date() || invitation.status === 'EXPIRED') {
    if (invitation.status === 'PENDING') {
      await app.prisma.teamInvitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } }).catch(() => undefined);
    }
    throw new AppError({ code: 'INVITATION_EXPIRED', message: 'Срок действия приглашения истёк', statusCode: 410 });
  }
  return invitation;
}

export async function acceptTeamInvitation(
  app: FastifyInstance,
  request: FastifyRequest,
  userId: string,
  token: string,
) {
  const tokenHash = hashSessionToken(token);
  const rawInvitation = await app.prisma.teamInvitation.findUnique({
    where: { tokenHash },
    include: { organization: true },
  });
  if (rawInvitation?.status === 'ACCEPTED' && rawInvitation.acceptedByUserId === userId) {
    const existing = await app.prisma.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: rawInvitation.organizationId, userId } },
      include: { organization: true },
    });
    if (!existing) throw new AppError({ code: 'MEMBERSHIP_NOT_FOUND', message: 'Участник команды не найден', statusCode: 404 });
    return {
      membership: {
        id: existing.id, userId: existing.userId, organizationId: existing.organizationId,
        role: frontendRole[existing.role as OrganizationRoleValue] || 'guest', backendRole: existing.role,
        accessRoleId: frontendRole[existing.role as OrganizationRoleValue] || 'guest',
        permissions: effectivePermissions(existing.role, existing.permissionOverrides as PermissionOverrides | null),
        permissionOverrides: (existing.permissionOverrides as PermissionOverrides | null) || { allow: [], deny: [] },
        accessExpiresAt: existing.accessExpiresAt?.toISOString() || null, securityStatus: 'active', status: 'ACTIVE',
        joinedAt: existing.joinedAt?.toISOString() || existing.createdAt.toISOString(),
        organization: { id: existing.organization.id, name: existing.organization.name, title: existing.organization.name, slug: existing.organization.slug, onboardingStatus: existing.organization.onboardingStatus },
        company: { id: existing.organization.id, title: existing.organization.name, inn: existing.organization.inn || '', kpp: existing.organization.kpp || '', ogrn: existing.organization.ogrn || '', legalAddress: existing.organization.legalAddress || '', verified: Boolean(existing.organization.registryVerifiedAt) },
      },
    };
  }
  const invitation = await getTeamInvitationByToken(app, token);
  const user = await app.prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError({ code: 'USER_NOT_FOUND', message: 'Пользователь не найден', statusCode: 404 });
  const userEmail = user.email?.trim().toLowerCase() || '';
  if (!userEmail || userEmail !== invitation.email.toLowerCase()) {
    throw new AppError({ code: 'INVITATION_EMAIL_MISMATCH', message: 'Войдите с email, на который отправлено приглашение', statusCode: 403 });
  }

  const now = new Date();
  const membership = await app.prisma.$transaction(async (tx) => {
    const fresh = await tx.teamInvitation.findUnique({ where: { id: invitation.id } });
    if (!fresh) throw new AppError({ code: 'INVITATION_NOT_FOUND', message: 'Приглашение не найдено', statusCode: 404 });
    if (fresh.status === 'ACCEPTED' && fresh.acceptedByUserId === userId) {
      return tx.organizationMember.findUniqueOrThrow({
        where: { organizationId_userId: { organizationId: fresh.organizationId, userId } },
        include: { organization: true },
      });
    }
    if (fresh.status !== 'PENDING' || fresh.expiresAt <= now) {
      throw new AppError({ code: 'INVITATION_UNAVAILABLE', message: 'Приглашение уже недоступно', statusCode: 409 });
    }

    const saved = await tx.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: fresh.organizationId, userId } },
      create: {
        organizationId: fresh.organizationId,
        userId,
        role: fresh.role,
        status: 'ACTIVE',
        invitedByUserId: fresh.createdByUserId,
        invitedAt: fresh.createdAt,
        joinedAt: now,
        accessExpiresAt: fresh.accessExpiresAt,
        permissionOverrides: fresh.permissionOverrides || { allow: [], deny: [] },
      },
      update: {
        role: fresh.role,
        status: 'ACTIVE',
        invitedByUserId: fresh.createdByUserId,
        joinedAt: now,
        accessExpiresAt: fresh.accessExpiresAt,
        permissionOverrides: fresh.permissionOverrides || { allow: [], deny: [] },
        suspendedAt: null,
        suspendedReason: null,
      },
      include: { organization: true },
    });

    await tx.teamInvitation.update({
      where: { id: fresh.id },
      data: { status: 'ACCEPTED', acceptedByUserId: userId, acceptedAt: now },
    });
    await tx.session.update({ where: { id: request.auth!.sessionId }, data: { activeOrganizationId: fresh.organizationId } });
    await tx.auditLog.create({
      data: {
        organizationId: fresh.organizationId,
        actorUserId: userId,
        action: 'team.invitation.accepted',
        entityType: 'organization_member',
        entityId: saved.id,
        metadata: { invitationId: fresh.id, role: fresh.role },
        ...auditContext(request),
      },
    });
    return saved;
  });

  return {
    membership: {
      id: membership.id,
      userId: membership.userId,
      organizationId: membership.organizationId,
      role: frontendRole[membership.role as OrganizationRoleValue] || 'guest',
      backendRole: membership.role,
      accessRoleId: frontendRole[membership.role as OrganizationRoleValue] || 'guest',
      permissions: effectivePermissions(membership.role, membership.permissionOverrides as PermissionOverrides | null),
      permissionOverrides: (membership.permissionOverrides as PermissionOverrides | null) || { allow: [], deny: [] },
      accessExpiresAt: membership.accessExpiresAt?.toISOString() || null,
      securityStatus: 'active',
      status: 'ACTIVE',
      joinedAt: membership.joinedAt?.toISOString() || now.toISOString(),
      organization: {
        id: membership.organization.id,
        name: membership.organization.name,
        title: membership.organization.name,
        slug: membership.organization.slug,
        onboardingStatus: membership.organization.onboardingStatus,
      },
      company: {
        id: membership.organization.id,
        title: membership.organization.name,
        inn: membership.organization.inn || '',
        kpp: membership.organization.kpp || '',
        ogrn: membership.organization.ogrn || '',
        legalAddress: membership.organization.legalAddress || '',
        verified: Boolean(membership.organization.registryVerifiedAt),
      },
    },
  };
}

export async function updateTeamMember(
  app: FastifyInstance,
  request: FastifyRequest,
  memberId: string,
  input: { role?: string; accessExpiresAt?: string | null; securityStatus?: 'active' | 'frozen'; frozenReason?: string; permissionOverrides?: PermissionOverrides },
) {
  const organizationId = request.auth!.organizationId!;
  const target = await app.prisma.organizationMember.findFirst({ where: { id: memberId, organizationId }, include: { user: true } });
  if (!target) throw new AppError({ code: 'MEMBER_NOT_FOUND', message: 'Участник команды не найден', statusCode: 404 });

  const nextRole = input.role !== undefined ? normalizeOrganizationRole(input.role) : target.role as OrganizationRoleValue;
  if (nextRole === 'OWNER' && request.auth!.role !== 'OWNER') {
    throw new AppError({ code: 'OWNER_ROLE_RESTRICTED', message: 'Назначить владельца может только владелец', statusCode: 403 });
  }
  if (target.role === 'OWNER' && (nextRole !== 'OWNER' || input.securityStatus === 'frozen')) {
    await assertCanTouchOwner(app, organizationId, request.auth!.role, target.role);
  }
  if (target.userId === request.auth!.userId && input.securityStatus === 'frozen') {
    throw new AppError({ code: 'CANNOT_FREEZE_SELF', message: 'Нельзя заморозить собственный доступ', statusCode: 409 });
  }

  const accessExpiresAt = parseOptionalDate(input.accessExpiresAt);
  if (accessExpiresAt && accessExpiresAt <= new Date()) {
    throw new AppError({ code: 'ACCESS_EXPIRY_INVALID', message: 'Срок доступа должен быть в будущем', statusCode: 400 });
  }
  const frozen = input.securityStatus === 'frozen';
  const activated = input.securityStatus === 'active';
  const now = new Date();

  const membership = await app.prisma.$transaction(async (tx) => {
    const saved = await tx.organizationMember.update({
      where: { id: target.id },
      data: {
        ...(input.role !== undefined ? { role: nextRole } : {}),
        ...(accessExpiresAt !== undefined ? { accessExpiresAt } : {}),
        ...(input.permissionOverrides !== undefined ? { permissionOverrides: input.permissionOverrides } : {}),
        ...(frozen ? { status: 'SUSPENDED', suspendedAt: now, suspendedReason: input.frozenReason || 'Доступ приостановлен администратором' } : {}),
        ...(activated ? { status: 'ACTIVE', suspendedAt: null, suspendedReason: null } : {}),
      },
      include: { user: true },
    });
    if (frozen) {
      await tx.session.updateMany({ where: { userId: target.userId, activeOrganizationId: organizationId, revokedAt: null }, data: { revokedAt: now } });
    }
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: frozen ? 'team.member.suspended' : activated ? 'team.member.restored' : 'team.member.updated',
        entityType: 'organization_member',
        entityId: target.id,
        metadata: { role: saved.role, accessExpiresAt: saved.accessExpiresAt?.toISOString() || null, permissionOverridesChanged: input.permissionOverrides !== undefined },
        ...auditContext(request),
      },
    });
    return saved;
  });

  return { member: membership };
}

export async function removeTeamMember(app: FastifyInstance, request: FastifyRequest, memberId: string) {
  const organizationId = request.auth!.organizationId!;
  const target = await app.prisma.organizationMember.findFirst({ where: { id: memberId, organizationId } });
  if (!target) throw new AppError({ code: 'MEMBER_NOT_FOUND', message: 'Участник команды не найден', statusCode: 404 });
  if (target.userId === request.auth!.userId) {
    throw new AppError({ code: 'CANNOT_REMOVE_SELF', message: 'Нельзя удалить собственный доступ из этого раздела', statusCode: 409 });
  }
  if (target.role === 'OWNER') await assertCanTouchOwner(app, organizationId, request.auth!.role, target.role);

  const now = new Date();
  await app.prisma.$transaction(async (tx) => {
    await tx.session.updateMany({ where: { userId: target.userId, activeOrganizationId: organizationId, revokedAt: null }, data: { revokedAt: now } });
    await tx.organizationMember.delete({ where: { id: target.id } });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: 'team.member.removed',
        entityType: 'organization_member',
        entityId: target.id,
        metadata: { userId: target.userId, role: target.role },
        ...auditContext(request),
      },
    });
  });
  return { ok: true };
}

export async function revokeInvitation(app: FastifyInstance, request: FastifyRequest, invitationId: string) {
  const organizationId = request.auth!.organizationId!;
  const result = await app.prisma.teamInvitation.updateMany({
    where: { id: invitationId, organizationId, status: 'PENDING' },
    data: { status: 'REVOKED', revokedAt: new Date() },
  });
  if (!result.count) throw new AppError({ code: 'INVITATION_NOT_FOUND', message: 'Активное приглашение не найдено', statusCode: 404 });
  await app.prisma.auditLog.create({
    data: { organizationId, actorUserId: request.auth!.userId, action: 'team.invitation.revoked', entityType: 'team_invitation', entityId: invitationId, ...auditContext(request) },
  });
  return { ok: true };
}

export async function revokeMemberSessions(app: FastifyInstance, request: FastifyRequest, memberId: string, sessionId?: string) {
  const organizationId = request.auth!.organizationId!;
  const member = await app.prisma.organizationMember.findFirst({ where: { id: memberId, organizationId } });
  if (!member) throw new AppError({ code: 'MEMBER_NOT_FOUND', message: 'Участник команды не найден', statusCode: 404 });
  const now = new Date();
  const result = await app.prisma.session.updateMany({
    where: { userId: member.userId, activeOrganizationId: organizationId, revokedAt: null, ...(sessionId ? { id: sessionId } : {}) },
    data: { revokedAt: now },
  });
  await app.prisma.auditLog.create({
    data: {
      organizationId,
      actorUserId: request.auth!.userId,
      action: sessionId ? 'team.session.revoked' : 'team.sessions.revoked',
      entityType: 'organization_member',
      entityId: memberId,
      metadata: { sessionId: sessionId || null, revoked: result.count },
      ...auditContext(request),
    },
  });
  return { ok: true, revoked: result.count, forcedLogoutAt: now.toISOString() };
}
