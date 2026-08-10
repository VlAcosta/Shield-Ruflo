import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { effectivePermissions, type PermissionOverrides } from '../../core/rbac/permissions.js';
import { presentUser, publicUserInclude } from '../auth/auth.presenter.js';

export const publicOrganizationSelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  onboardingStatus: true,
  onboardingCompletedAt: true,
  timezone: true,
  locale: true,
  legalName: true,
  industry: true,
  website: true,
  legalType: true,
  inn: true,
  kpp: true,
  ogrn: true,
  legalAddress: true,
  legalStatus: true,
  registrationDate: true,
  registrySource: true,
  registryVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function slugBase(input: string): string {
  const transliterated = input.toLowerCase()
    .replace(/а/g, 'a').replace(/б/g, 'b').replace(/в/g, 'v').replace(/г/g, 'g')
    .replace(/д/g, 'd').replace(/е|ё/g, 'e').replace(/ж/g, 'zh').replace(/з/g, 'z')
    .replace(/и|й/g, 'i').replace(/к/g, 'k').replace(/л/g, 'l').replace(/м/g, 'm')
    .replace(/н/g, 'n').replace(/о/g, 'o').replace(/п/g, 'p').replace(/р/g, 'r')
    .replace(/с/g, 's').replace(/т/g, 't').replace(/у/g, 'u').replace(/ф/g, 'f')
    .replace(/х/g, 'h').replace(/ц/g, 'c').replace(/ч/g, 'ch').replace(/ш/g, 'sh')
    .replace(/щ/g, 'sch').replace(/ы/g, 'y').replace(/э/g, 'e').replace(/ю/g, 'yu').replace(/я/g, 'ya')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return transliterated || 'workspace';
}

export function createOrganizationSlug(name: string): string {
  return `${slugBase(name)}-${randomBytes(4).toString('hex')}`.slice(0, 120);
}

export async function ensureUserWorkspaceWithClient(
  prisma: Prisma.TransactionClient,
  userId: string,
  displayName = '',
): Promise<string> {
  const existing = await prisma.organizationMember.findFirst({
    where: { userId, status: 'ACTIVE', AND: [{ OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: new Date() } }] }], organization: { status: 'ACTIVE' } },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  });
  if (existing) return existing.organizationId;

  const workspaceName = displayName ? `Пространство ${displayName}` : 'Рабочее пространство';
  const created = await prisma.organization.create({
    data: {
      name: workspaceName,
      slug: createOrganizationSlug(workspaceName),
      onboardingStatus: 'NOT_STARTED',
      members: { create: { userId, role: 'OWNER', status: 'ACTIVE', joinedAt: new Date() } },
      businesses: { create: { name: 'Новый бизнес', isPrimary: true, status: 'ACTIVE' } },
    },
    select: { id: true },
  });
  return created.id;
}

export async function ensureUserWorkspace(app: FastifyInstance, userId: string, displayName = ''): Promise<string> {
  return app.prisma.$transaction((tx) => ensureUserWorkspaceWithClient(tx, userId, displayName));
}

export async function listOrganizations(app: FastifyInstance, userId: string) {
  const memberships = await app.prisma.organizationMember.findMany({
    where: { userId, status: 'ACTIVE', AND: [{ OR: [{ accessExpiresAt: null }, { accessExpiresAt: { gt: new Date() } }] }], organization: { status: 'ACTIVE' } },
    orderBy: { createdAt: 'asc' },
    include: { organization: { select: publicOrganizationSelect } },
  });
  return memberships.map((membership) => ({
    membership: {
      id: membership.id,
      role: membership.role,
      status: membership.status,
      permissions: effectivePermissions(membership.role, membership.permissionOverrides as PermissionOverrides | null),
      permissionOverrides: (membership.permissionOverrides as PermissionOverrides | null) || { allow: [], deny: [] },
      accessExpiresAt: membership.accessExpiresAt?.toISOString() || null,
    },
    organization: membership.organization,
  }));
}

export async function requireOrganizationMembership(app: FastifyInstance, userId: string, organizationId: string) {
  const membership = await app.prisma.organizationMember.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: { select: publicOrganizationSelect } },
  });
  if (!membership || membership.status !== 'ACTIVE' || membership.organization.status !== 'ACTIVE' || (membership.accessExpiresAt && membership.accessExpiresAt <= new Date())) {
    throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Рабочее пространство не найдено', statusCode: 404 });
  }
  return membership;
}

export async function selectOrganization(app: FastifyInstance, request: FastifyRequest, organizationId: string) {
  if (!request.auth) throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
  await app.prisma.$transaction(async (tx) => {
    const membership = await tx.organizationMember.findUnique({
      where: { organizationId_userId: { organizationId, userId: request.auth!.userId } },
      include: { organization: { select: { status: true } } },
    });
    if (!membership || membership.status !== 'ACTIVE' || membership.organization.status !== 'ACTIVE' || (membership.accessExpiresAt && membership.accessExpiresAt <= new Date())) {
      throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Рабочее пространство не найдено', statusCode: 404 });
    }
    await tx.session.update({ where: { id: request.auth!.sessionId }, data: { activeOrganizationId: organizationId } });
    await tx.auditLog.create({
      data: {
        organizationId,
        actorUserId: request.auth!.userId,
        action: 'organization.selected',
        entityType: 'organization',
        entityId: organizationId,
        metadata: { switchedFromAnotherOrganization: request.auth!.organizationId !== null },
        ipAddress: request.ip,
        userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
      },
    });
  });
  const user = await app.prisma.user.findUniqueOrThrow({ where: { id: request.auth.userId }, include: publicUserInclude });
  return { ok: true, user: presentUser(user, organizationId) };
}

export async function getOrganizationContext(app: FastifyInstance, userId: string, organizationId: string) {
  const membership = await requireOrganizationMembership(app, userId, organizationId);
  const businesses = await app.prisma.business.findMany({
    where: { organizationId, status: 'ACTIVE' },
    orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    include: { locations: { where: { status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
  });
  return {
    organization: membership.organization,
    membership: {
      id: membership.id,
      role: membership.role,
      status: membership.status,
      permissions: effectivePermissions(membership.role, membership.permissionOverrides as PermissionOverrides | null),
      permissionOverrides: (membership.permissionOverrides as PermissionOverrides | null) || { allow: [], deny: [] },
      accessExpiresAt: membership.accessExpiresAt?.toISOString() || null,
    },
    businesses,
  };
}

export async function assertActiveOrganization(request: FastifyRequest, organizationId: string): Promise<void> {
  if (!request.auth?.organizationId || request.auth.organizationId !== organizationId) {
    throw new AppError({ code: 'ORGANIZATION_NOT_FOUND', message: 'Рабочее пространство не найдено', statusCode: 404 });
  }
}

export async function requireActiveBusiness(app: FastifyInstance, organizationId: string, businessId: string) {
  const business = await app.prisma.business.findFirst({
    where: { id: businessId, organizationId, status: 'ACTIVE' },
    include: { locations: { where: { status: 'ACTIVE' }, orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } },
  });
  if (!business) throw new AppError({ code: 'BUSINESS_NOT_FOUND', message: 'Бизнес не найден', statusCode: 404 });
  return business;
}

export async function requireActiveLocation(app: FastifyInstance, organizationId: string, locationId: string) {
  const location = await app.prisma.location.findFirst({
    where: { id: locationId, status: 'ACTIVE', business: { organizationId, status: 'ACTIVE' } },
    include: { business: { select: { id: true, organizationId: true, isPrimary: true } } },
  });
  if (!location) throw new AppError({ code: 'LOCATION_NOT_FOUND', message: 'Филиал не найден', statusCode: 404 });
  return location;
}
