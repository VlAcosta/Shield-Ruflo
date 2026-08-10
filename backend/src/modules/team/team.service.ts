import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { effectivePermissions, essentialOwnerPermissions, isNonDelegablePermission, isPermission, type Permission, type PermissionOverrides } from '../../core/rbac/permissions.js';
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
  MANAGER: 'manager',
  ANALYST: 'analyst',
  MEMBER: 'member',
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
  return frontendRole[normalized] || 'member';
}

const assignableRoles = {
  OWNER: ['ADMIN', 'MANAGER', 'ANALYST', 'MEMBER'],
  ADMIN: ['MANAGER', 'ANALYST', 'MEMBER'],
  MANAGER: ['ANALYST', 'MEMBER'],
  ANALYST: ['MEMBER'],
  MEMBER: ['MEMBER'],
} as const satisfies Readonly<Record<OrganizationRoleValue, readonly OrganizationRoleValue[]>>;
const roleRank: Readonly<Record<OrganizationRoleValue, number>> = Object.freeze({
  OWNER: 5, ADMIN: 4, MANAGER: 3, ANALYST: 2, MEMBER: 1,
});

export function assertRoleAssignmentAllowed(
  actorRole: OrganizationRoleValue,
  nextRole: OrganizationRoleValue,
  options: { isSelf?: boolean; currentRole?: OrganizationRoleValue } = {},
): void {
  if (nextRole === 'OWNER' && options.currentRole !== 'OWNER') {
    throw new AppError({ code: 'OWNER_ROLE_RESTRICTED', message: 'Назначение роли владельца недоступно в этом разделе', statusCode: 403 });
  }
  if (options.isSelf && options.currentRole && roleRank[nextRole] > roleRank[options.currentRole]) {
    throw new AppError({ code: 'CANNOT_PROMOTE_SELF', message: 'Нельзя повысить собственную роль', statusCode: 409 });
  }
  if (
    !options.isSelf
    && options.currentRole
    && actorRole !== 'OWNER'
    && roleRank[options.currentRole] >= roleRank[actorRole]
  ) {
    throw new AppError({ code: 'ROLE_ASSIGNMENT_FORBIDDEN', message: 'Нельзя изменять участника с равным или более высоким уровнем доступа', statusCode: 403 });
  }
  if (nextRole === options.currentRole) return;
  if (!(assignableRoles[actorRole] as readonly OrganizationRoleValue[]).includes(nextRole)) {
    throw new AppError({ code: 'ROLE_ASSIGNMENT_FORBIDDEN', message: 'Нельзя назначить роль с таким уровнем доступа', statusCode: 403 });
  }
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

function assertAssignableOverrides(actorPermissions: readonly Permission[], overrides: PermissionOverrides | undefined): void {
  if (!overrides) return;
  const requested = [...(overrides.allow ?? []), ...(overrides.deny ?? [])];
  if (requested.some((permission) => !isPermission(permission))) {
    throw new AppError({ code: 'INVALID_PERMISSION', message: 'Неизвестное разрешение', statusCode: 400 });
  }
  const ownerOnlyGrant = (overrides.allow ?? []).find(isNonDelegablePermission);
  if (ownerOnlyGrant) {
    throw new AppError({ code: 'PERMISSION_NON_DELEGABLE', message: 'Это разрешение доступно только владельцу и не может быть делегировано', statusCode: 403 });
  }
  const excessiveGrant = (overrides.allow ?? []).find((permission) => (
    !actorPermissions.includes(permission as Permission)
  ));
  if (excessiveGrant) {
    throw new AppError({ code: 'PERMISSION_ESCALATION', message: 'Нельзя назначить разрешение, которого нет у текущего пользователя', statusCode: 403 });
  }
}

function assertOwnerOverridesSafe(role: OrganizationRoleValue, overrides: PermissionOverrides | undefined): void {
  if (role !== 'OWNER' || !overrides) return;
  const deniedEssential = (overrides.deny ?? []).find((permission) => (
    isPermission(permission) && essentialOwnerPermissions.includes(permission)
  ));
  if (deniedEssential) {
    throw new AppError({
      code: 'OWNER_PERMISSION_REQUIRED',
      message: 'У владельца должны сохраняться полномочия управления организацией',
      statusCode: 409,
    });
  }
}

async function lockOrganization(tx: Prisma.TransactionClient, organizationId: string): Promise<void> {
  // pg_advisory_xact_lock returns PostgreSQL `void`, which Prisma cannot decode
  // through $queryRaw. Execute it without materializing a result while keeping
  // the transaction-scoped lock held until this transaction completes.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${organizationId}, 0))`;
}

async function requireCurrentTeamActor(
  tx: Prisma.TransactionClient,
  request: FastifyRequest,
  organizationId: string,
) {
  const actor = await tx.organizationMember.findFirst({
    where: {
      id: request.auth!.membershipId!,
      userId: request.auth!.userId,
      organizationId,
      status: 'ACTIVE',
      OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: new Date() } }],
    },
  });
  const actorPermissions = actor
    ? effectivePermissions(actor.role, actor.permissionOverrides as PermissionOverrides | null)
    : [];
  if (!actor || !actorPermissions.includes('team.manage')) {
    throw new AppError({ code: 'FORBIDDEN', message: 'Недостаточно прав для выполнения операции', statusCode: 403 });
  }
  return { actor, permissions: actorPermissions };
}

async function assertAnotherUsableOwner(
  tx: Prisma.TransactionClient,
  organizationId: string,
  targetId: string,
  requiredUntil = new Date(),
): Promise<void> {
  const ownerCount = await tx.organizationMember.count({
    where: {
      organizationId,
      id: { not: targetId },
      role: 'OWNER',
      status: 'ACTIVE',
      OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: requiredUntil } }],
    },
  });
  if (ownerCount === 0) {
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
      role: frontendRole[membership.role as OrganizationRoleValue] || 'member',
      backendRole: membership.role,
      accessRoleId: frontendRole[membership.role as OrganizationRoleValue] || 'member',
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
    role: frontendRole[invitation.role as OrganizationRoleValue] || 'member',
    backendRole: invitation.role,
    accessRoleId: frontendRole[invitation.role as OrganizationRoleValue] || 'member',
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
  const email = input.email.trim().toLowerCase();
  const accessExpiresAt = parseOptionalDate(input.accessExpiresAt);
  if (accessExpiresAt && accessExpiresAt <= new Date()) {
    throw new AppError({ code: 'ACCESS_EXPIRY_INVALID', message: 'Срок доступа должен быть в будущем', statusCode: 400 });
  }

  const token = createOpaqueToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
  const invitation = await app.prisma.$transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const currentActor = await requireCurrentTeamActor(tx, request, organizationId);
    assertAssignableOverrides(currentActor.permissions, input.permissionOverrides);
    assertRoleAssignmentAllowed(currentActor.actor.role as OrganizationRoleValue, role);
    assertOwnerOverridesSafe(role, input.permissionOverrides);
    const existingMember = await tx.organizationMember.findFirst({
      where: { organizationId, user: { email } },
      select: { id: true },
    });
    if (existingMember) {
      throw new AppError({ code: 'MEMBER_ALREADY_EXISTS', message: 'Пользователь с этим email уже состоит в команде', statusCode: 409 });
    }
    await tx.teamInvitation.updateMany({
      where: { organizationId, email, status: 'PENDING' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    const saved = await tx.teamInvitation.create({
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
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: currentActor.actor.userId,
        action: 'team.invitation.created',
        entityType: 'team_invitation',
        entityId: saved.id,
        metadata: { email, role, expiresAt: expiresAt.toISOString() },
        ...auditContext(request),
      },
    });
    return saved;
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

/** Accept an invitation as part of a caller-owned transaction. */
export async function acceptTeamInvitationWithClient(
  tx: Prisma.TransactionClient,
  request: FastifyRequest,
  userId: string,
  token: string,
): Promise<string> {
  const now = new Date();
  const invitation = await tx.teamInvitation.findUnique({
    where: { tokenHash: hashSessionToken(token) },
  });
  if (!invitation) {
    throw new AppError({ code: 'INVITATION_NOT_FOUND', message: 'Приглашение не найдено или уже недоступно', statusCode: 404 });
  }
  if (invitation.status === 'ACCEPTED' && invitation.acceptedByUserId === userId) {
    const existing = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
      select: { organizationId: true },
    });
    if (!existing) throw new AppError({ code: 'MEMBERSHIP_NOT_FOUND', message: 'Участник команды не найден', statusCode: 404 });
    return existing.organizationId;
  }
  if (invitation.status !== 'PENDING' || invitation.expiresAt <= now) {
    throw new AppError({ code: 'INVITATION_UNAVAILABLE', message: 'Приглашение уже недоступно', statusCode: 409 });
  }
  const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) throw new AppError({ code: 'USER_NOT_FOUND', message: 'Пользователь не найден', statusCode: 404 });
  if (!user.email || user.email.trim().toLowerCase() !== invitation.email.toLowerCase()) {
    throw new AppError({ code: 'INVITATION_EMAIL_MISMATCH', message: 'Войдите с email, на который отправлено приглашение', statusCode: 403 });
  }

  const membership = await tx.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
    create: {
      organizationId: invitation.organizationId,
      userId,
      role: invitation.role,
      status: 'ACTIVE',
      invitedByUserId: invitation.createdByUserId,
      invitedAt: invitation.createdAt,
      joinedAt: now,
      accessExpiresAt: invitation.accessExpiresAt,
      permissionOverrides: invitation.permissionOverrides || { allow: [], deny: [] },
    },
    update: {
      role: invitation.role,
      status: 'ACTIVE',
      invitedByUserId: invitation.createdByUserId,
      joinedAt: now,
      accessExpiresAt: invitation.accessExpiresAt,
      permissionOverrides: invitation.permissionOverrides || { allow: [], deny: [] },
      suspendedAt: null,
      suspendedReason: null,
    },
  });
  await tx.teamInvitation.update({
    where: { id: invitation.id },
    data: { status: 'ACCEPTED', acceptedByUserId: userId, acceptedAt: now },
  });
  await tx.auditLog.create({
    data: {
      organizationId: invitation.organizationId,
      actorUserId: userId,
      action: 'team.invitation.accepted',
      entityType: 'organization_member',
      entityId: membership.id,
      metadata: { invitationId: invitation.id, role: invitation.role },
      ...auditContext(request),
    },
  });
  return invitation.organizationId;
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
        role: frontendRole[existing.role as OrganizationRoleValue] || 'member', backendRole: existing.role,
        accessRoleId: frontendRole[existing.role as OrganizationRoleValue] || 'member',
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
      role: frontendRole[membership.role as OrganizationRoleValue] || 'member',
      backendRole: membership.role,
      accessRoleId: frontendRole[membership.role as OrganizationRoleValue] || 'member',
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
  const accessExpiresAt = parseOptionalDate(input.accessExpiresAt);
  if (accessExpiresAt && accessExpiresAt <= new Date()) {
    throw new AppError({ code: 'ACCESS_EXPIRY_INVALID', message: 'Срок доступа должен быть в будущем', statusCode: 400 });
  }
  const frozen = input.securityStatus === 'frozen';
  const activated = input.securityStatus === 'active';
  const now = new Date();

  const membership = await app.prisma.$transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const currentActor = await requireCurrentTeamActor(tx, request, organizationId);
    assertAssignableOverrides(currentActor.permissions, input.permissionOverrides);
    const target = await tx.organizationMember.findFirst({ where: { id: memberId, organizationId }, include: { user: true } });
    if (!target) throw new AppError({ code: 'MEMBER_NOT_FOUND', message: 'Участник команды не найден', statusCode: 404 });
    const nextRole = input.role !== undefined ? normalizeOrganizationRole(input.role) : target.role as OrganizationRoleValue;
    if (target.role === 'OWNER' && currentActor.actor.role !== 'OWNER') {
      throw new AppError({ code: 'OWNER_PROTECTED', message: 'Изменять владельца может только владелец организации', statusCode: 403 });
    }
    assertRoleAssignmentAllowed(currentActor.actor.role as OrganizationRoleValue, nextRole, {
      isSelf: target.userId === request.auth!.userId,
      currentRole: target.role as OrganizationRoleValue,
    });
    assertOwnerOverridesSafe(nextRole, input.permissionOverrides);
    if (target.userId === request.auth!.userId && frozen) {
      throw new AppError({ code: 'CANNOT_FREEZE_SELF', message: 'Нельзя заморозить собственный доступ', statusCode: 409 });
    }
    const makesOwnerUnusable = target.role === 'OWNER' && (
      nextRole !== 'OWNER'
      || frozen
      || (accessExpiresAt !== undefined && accessExpiresAt !== null)
      || input.permissionOverrides !== undefined
    );
    if (makesOwnerUnusable) {
      await assertAnotherUsableOwner(tx, organizationId, target.id, accessExpiresAt ?? now);
    }

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
  const now = new Date();
  await app.prisma.$transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const currentActor = await requireCurrentTeamActor(tx, request, organizationId);
    const target = await tx.organizationMember.findFirst({ where: { id: memberId, organizationId } });
    if (!target) throw new AppError({ code: 'MEMBER_NOT_FOUND', message: 'Участник команды не найден', statusCode: 404 });
    if (target.userId === request.auth!.userId) {
      throw new AppError({ code: 'CANNOT_REMOVE_SELF', message: 'Нельзя удалить собственный доступ из этого раздела', statusCode: 409 });
    }
    if (target.role === 'OWNER' && currentActor.actor.role !== 'OWNER') {
      throw new AppError({ code: 'OWNER_PROTECTED', message: 'Изменять владельца может только владелец организации', statusCode: 403 });
    }
    if (target.role === 'OWNER') await assertAnotherUsableOwner(tx, organizationId, target.id);
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
  await app.prisma.$transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const currentActor = await requireCurrentTeamActor(tx, request, organizationId);
    const result = await tx.teamInvitation.updateMany({
      where: { id: invitationId, organizationId, status: 'PENDING' },
      data: { status: 'REVOKED', revokedAt: new Date() },
    });
    if (!result.count) throw new AppError({ code: 'INVITATION_NOT_FOUND', message: 'Активное приглашение не найдено', statusCode: 404 });
    await tx.auditLog.create({
      data: { organizationId, actorUserId: currentActor.actor.userId, action: 'team.invitation.revoked', entityType: 'team_invitation', entityId: invitationId, ...auditContext(request) },
    });
  });
  return { ok: true };
}

export async function revokeMemberSessions(app: FastifyInstance, request: FastifyRequest, memberId: string, sessionId?: string) {
  const organizationId = request.auth!.organizationId!;
  const now = new Date();
  const revoked = await app.prisma.$transaction(async (tx) => {
    await lockOrganization(tx, organizationId);
    const currentActor = await requireCurrentTeamActor(tx, request, organizationId);
    const member = await tx.organizationMember.findFirst({ where: { id: memberId, organizationId } });
    if (!member) throw new AppError({ code: 'MEMBER_NOT_FOUND', message: 'Участник команды не найден', statusCode: 404 });
    if (member.role === 'OWNER' && currentActor.actor.role !== 'OWNER') {
      throw new AppError({ code: 'OWNER_PROTECTED', message: 'Управлять сессиями владельца может только владелец организации', statusCode: 403 });
    }
    const result = await tx.session.updateMany({
      where: { userId: member.userId, activeOrganizationId: organizationId, revokedAt: null, ...(sessionId ? { id: sessionId } : {}) },
      data: { revokedAt: now },
    });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: currentActor.actor.userId,
        action: sessionId ? 'team.session.revoked' : 'team.sessions.revoked',
        entityType: 'organization_member',
        entityId: memberId,
        metadata: { sessionId: sessionId || null, revoked: result.count },
        ...auditContext(request),
      },
    });
    return result.count;
  });
  return { ok: true, revoked, forcedLogoutAt: now.toISOString() };
}
