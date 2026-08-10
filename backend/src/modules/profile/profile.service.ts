import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { getCompanyProfile } from '../company/company.service.js';
import { listTeamMembers } from '../team/team.service.js';

type NotificationPreferences = {
  email?: boolean;
  telegram?: boolean;
  push?: boolean;
};

function sessionDevice(userAgent: string | null) {
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
  return {
    device: /Mobile|Android|iPhone|iPad/i.test(ua) ? 'mobile' : 'desktop',
    title: `${browser} · ${os}`,
  };
}

function sessionTime(lastSeenAt: Date | null, createdAt: Date) {
  const date = lastSeenAt || createdAt;
  const delta = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'сейчас';
  if (minutes < 60) return `${minutes} мин. назад`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ч. назад`;
  return date.toLocaleDateString('ru-RU');
}

async function currentUser(app: FastifyInstance, userId: string) {
  const user = await app.prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'ACTIVE') {
    throw new AppError({ code: 'USER_NOT_FOUND', message: 'Пользователь не найден', statusCode: 404 });
  }
  return user;
}

function normalizedNotificationPreferences(value: unknown): Required<NotificationPreferences> {
  const defaults = { email: true, telegram: false, push: false };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const raw = value as Record<string, unknown>;
  return {
    email: typeof raw.email === 'boolean' ? raw.email : defaults.email,
    telegram: typeof raw.telegram === 'boolean' ? raw.telegram : defaults.telegram,
    push: typeof raw.push === 'boolean' ? raw.push : defaults.push,
  };
}

export async function getProfileSnapshot(app: FastifyInstance, request: FastifyRequest) {
  if (!request.auth) throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
  const user = await currentUser(app, request.auth.userId);
  const sessions = await app.prisma.session.findMany({
    where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
  });
  const companyPayload = request.auth.organizationId && request.auth.permissions.includes('company.view')
    ? await getCompanyProfile(app, request.auth.organizationId)
    : null;
  const users = request.auth.organizationId && request.auth.permissions.includes('team.view')
    ? await listTeamMembers(app, request.auth.organizationId)
    : [];

  return {
    snapshot: {
      version: 2,
      personal: {
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        email: user.email || '',
        phone: user.phone,
        position: user.position || '',
        telegram: user.telegram || '',
        avatar: user.avatarUrl || '',
        stats: { reports: 0, score: 0, days: Math.max(1, Math.floor((Date.now() - user.createdAt.getTime()) / 86_400_000) + 1) },
        notifications: normalizedNotificationPreferences(user.notificationPreferences),
      },
      company: companyPayload?.company || {},
      sessions: sessions.map((session) => {
        const device = sessionDevice(session.userAgent);
        return {
          id: session.id,
          current: session.id === request.auth!.sessionId,
          device: device.device,
          title: device.title,
          ip: session.ipAddress || '',
          location: '',
          time: session.id === request.auth!.sessionId ? 'Текущая сессия' : sessionTime(session.lastSeenAt, session.createdAt),
          createdAt: session.createdAt.toISOString(),
          lastSeenAt: session.lastSeenAt?.toISOString() || session.createdAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
        };
      }),
      users,
    },
  };
}

export async function updatePersonalProfile(
  app: FastifyInstance,
  request: FastifyRequest,
  input: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    position?: string;
    telegram?: string;
    avatar?: string;
    notifications?: NotificationPreferences;
  },
) {
  if (!request.auth) throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
  const existing = await currentUser(app, request.auth.userId);
  if (input.phone !== undefined && input.phone && input.phone !== existing.phone) {
    throw new AppError({
      code: 'PHONE_CHANGE_REQUIRES_VERIFICATION',
      message: 'Смена телефона требует отдельного подтверждения кодом',
      statusCode: 409,
    });
  }

  const email = input.email !== undefined ? input.email.trim().toLowerCase() || null : undefined;
  if (email) {
    const owner = await app.prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (owner && owner.id !== existing.id) {
      throw new AppError({ code: 'EMAIL_TAKEN', message: 'Этот email уже используется', statusCode: 409 });
    }
  }

  const firstName = input.firstName !== undefined ? input.firstName.trim() : existing.firstName;
  const lastName = input.lastName !== undefined ? input.lastName.trim() : existing.lastName;
  const displayName = `${firstName || ''} ${lastName || ''}`.trim() || existing.displayName;
  const emailChanged = email !== undefined && email !== existing.email;
  const notificationPreferences = input.notifications !== undefined
    ? { ...normalizedNotificationPreferences(existing.notificationPreferences), ...input.notifications }
    : undefined;

  await app.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: existing.id },
      data: {
        ...(input.firstName !== undefined ? { firstName: input.firstName.trim() } : {}),
        ...(input.lastName !== undefined ? { lastName: input.lastName.trim() } : {}),
        ...(displayName ? { displayName } : {}),
        ...(email !== undefined ? { email, ...(emailChanged ? { emailVerifiedAt: null } : {}) } : {}),
        ...(input.position !== undefined ? { position: input.position.trim() || null } : {}),
        ...(input.telegram !== undefined ? { telegram: input.telegram.trim() || null } : {}),
        ...(input.avatar !== undefined ? { avatarUrl: input.avatar || null } : {}),
        ...(notificationPreferences !== undefined ? { notificationPreferences } : {}),
      },
    });
    await tx.auditLog.create({
      data: {
        organizationId: request.auth!.organizationId,
        actorUserId: existing.id,
        action: 'profile.personal.updated',
        entityType: 'user',
        entityId: existing.id,
        metadata: { fields: Object.keys(input).filter((field) => field !== 'avatar'), emailChanged },
        ipAddress: request.ip,
        userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
      },
    });
  });

  return getProfileSnapshot(app, request);
}

export async function revokeOwnSession(app: FastifyInstance, request: FastifyRequest, sessionId: string) {
  if (!request.auth) throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
  if (sessionId === request.auth.sessionId) {
    throw new AppError({ code: 'CURRENT_SESSION_PROTECTED', message: 'Текущую сессию завершайте через кнопку «Выйти»', statusCode: 409 });
  }
  const result = await app.prisma.session.updateMany({
    where: { id: sessionId, userId: request.auth.userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (!result.count) throw new AppError({ code: 'SESSION_NOT_FOUND', message: 'Сессия не найдена', statusCode: 404 });
  return getProfileSnapshot(app, request);
}

export async function revokeOtherOwnSessions(app: FastifyInstance, request: FastifyRequest) {
  if (!request.auth) throw new AppError({ code: 'UNAUTHENTICATED', message: 'Требуется авторизация', statusCode: 401 });
  await app.prisma.session.updateMany({
    where: { userId: request.auth.userId, id: { not: request.auth.sessionId }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return getProfileSnapshot(app, request);
}
