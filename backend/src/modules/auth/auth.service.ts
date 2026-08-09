import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { env } from '../../config/env.js';
import {
  createOpaqueToken,
  createOtpCode,
  hashOtpCode,
  hashSessionToken,
  secureHashEquals,
} from '../../shared/security/tokens.js';
import { presentUser, publicUserInclude } from './auth.presenter.js';
import type { AuthContext } from './auth.types.js';
import { deliverOtp } from './otp.delivery.js';
import { readCookie } from '../../shared/http/cookies.js';
import { ensureUserWorkspace } from '../organizations/organization.service.js';
import { acceptTeamInvitation, getTeamInvitationByToken } from '../team/team.service.js';

function purposeForMode(mode: 'login' | 'register'): 'SIGN_IN' | 'SIGN_UP' {
  return mode === 'register' ? 'SIGN_UP' : 'SIGN_IN';
}

function clientMetadata(request: FastifyRequest): { ipAddress: string; userAgent: string } {
  return {
    ipAddress: request.ip,
    userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
  };
}

async function issueSession(
  app: FastifyInstance,
  userId: string,
  request: FastifyRequest,
  preferredOrganizationId?: string | null,
): Promise<{ token: string; sessionId: string; expiresAt: Date; activeOrganizationId: string | null }> {
  const token = createOpaqueToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + env.AUTH_SESSION_TTL_SECONDS * 1000);
  const metadata = clientMetadata(request);
  const membership = await app.prisma.organizationMember.findFirst({
    where: {
      userId,
      status: 'ACTIVE',
      organization: { status: 'ACTIVE' },
      ...(preferredOrganizationId ? { organizationId: preferredOrganizationId } : {}),
    },
    orderBy: { createdAt: 'asc' },
    select: { organizationId: true },
  });
  const activeOrganizationId = membership?.organizationId ?? null;

  const session = await app.prisma.session.create({
    data: {
      userId,
      activeOrganizationId,
      tokenHash,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      expiresAt,
      lastSeenAt: new Date(),
    },
  });

  return { token, sessionId: session.id, expiresAt, activeOrganizationId };
}

export async function requestVerificationCode(
  app: FastifyInstance,
  request: FastifyRequest,
  input: { phone: string; mode: 'login' | 'register'; invitationToken?: string | null },
) {
  if (input.invitationToken) await getTeamInvitationByToken(app, input.invitationToken);
  const now = new Date();
  const purpose = purposeForMode(input.mode);
  const cooldownAfter = new Date(now.getTime() - env.AUTH_OTP_RESEND_SECONDS * 1000);
  const ipWindowAfter = new Date(now.getTime() - env.AUTH_OTP_IP_WINDOW_SECONDS * 1000);

  const ipRequests = await app.prisma.verificationCode.count({
    where: { requestIp: request.ip, createdAt: { gt: ipWindowAfter } },
  });
  if (ipRequests >= env.AUTH_OTP_IP_MAX_REQUESTS) {
    throw new AppError({
      code: 'OTP_RATE_LIMIT',
      message: 'Слишком много запросов кода подтверждения. Попробуйте позже.',
      statusCode: 429,
      details: { retryAfter: env.AUTH_OTP_IP_WINDOW_SECONDS },
    });
  }

  const recent = await app.prisma.verificationCode.findFirst({
    where: {
      phone: input.phone,
      createdAt: { gt: cooldownAfter },
      consumedAt: null,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recent) {
    const retryAfter = Math.max(
      1,
      Math.ceil((recent.createdAt.getTime() + env.AUTH_OTP_RESEND_SECONDS * 1000 - Date.now()) / 1000),
    );
    throw new AppError({
      code: 'OTP_COOLDOWN',
      message: `Повторный код можно запросить через ${retryAfter} сек.`,
      statusCode: 429,
      details: { retryAfter },
    });
  }

  await app.prisma.verificationCode.updateMany({
    where: { phone: input.phone, consumedAt: null },
    data: { consumedAt: now },
  });

  const challengeId = randomUUID();
  const code = createOtpCode(env.AUTH_OTP_FIXED_CODE);
  const codeHash = hashOtpCode({
    secret: env.AUTH_SECRET,
    challengeId,
    phone: input.phone,
    purpose,
    code,
  });
  const existingUser = await app.prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } });
  const expiresAt = new Date(now.getTime() + env.AUTH_OTP_TTL_SECONDS * 1000);

  await app.prisma.verificationCode.create({
    data: {
      id: challengeId,
      ...(existingUser?.id ? { userId: existingUser.id } : {}),
      phone: input.phone,
      purpose,
      codeHash,
      maxAttempts: env.AUTH_OTP_MAX_ATTEMPTS,
      requestIp: request.ip,
      expiresAt,
    },
  });

  try {
    await deliverOtp(app, {
      phone: input.phone,
      code,
      challengeId,
      ttlSeconds: env.AUTH_OTP_TTL_SECONDS,
    });
  } catch (error) {
    await app.prisma.verificationCode.update({
      where: { id: challengeId },
      data: { consumedAt: new Date() },
    });
    throw error;
  }

  request.log.info(
    {
      authEvent: 'otp_requested',
      phone: input.phone.replace(/.(?=.{4})/g, '*'),
      sessionId: challengeId,
      provider: env.AUTH_OTP_PROVIDER,
    },
    'OTP challenge created',
  );

  return {
    session_id: challengeId,
    ttl: env.AUTH_OTP_TTL_SECONDS,
    delivery: env.AUTH_OTP_PROVIDER,
    ...(env.AUTH_EXPOSE_DEBUG_CODE ? { debug_code: code } : {}),
  };
}

export async function verifyVerificationCode(
  app: FastifyInstance,
  request: FastifyRequest,
  input: { phone: string; code: string; sessionId: string; mode: 'login' | 'register'; invitationToken?: string | null },
) {
  const now = new Date();
  const challenge = await app.prisma.verificationCode.findUnique({ where: { id: input.sessionId } });

  if (!challenge || challenge.phone !== input.phone) {
    throw new AppError({ code: 'OTP_NOT_FOUND', message: 'Сессия подтверждения не найдена', statusCode: 404 });
  }
  if (challenge.purpose !== purposeForMode(input.mode)) {
    throw new AppError({ code: 'OTP_MODE_MISMATCH', message: 'Режим подтверждения не совпадает с запрошенным', statusCode: 400 });
  }
  if (challenge.consumedAt) {
    throw new AppError({ code: 'OTP_ALREADY_USED', message: 'Код уже использован', statusCode: 400 });
  }
  if (challenge.expiresAt <= now) {
    throw new AppError({ code: 'OTP_EXPIRED', message: 'Срок действия кода истёк', statusCode: 400 });
  }
  if (challenge.attempts >= challenge.maxAttempts) {
    throw new AppError({ code: 'OTP_LOCKED', message: 'Превышено количество попыток. Запросите новый код.', statusCode: 429 });
  }

  const expectedHash = hashOtpCode({
    secret: env.AUTH_SECRET,
    challengeId: challenge.id,
    phone: challenge.phone,
    purpose: challenge.purpose,
    code: input.code,
  });

  if (!secureHashEquals(challenge.codeHash, expectedHash)) {
    const updated = await app.prisma.verificationCode.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
      select: { attempts: true, maxAttempts: true },
    });
    if (updated.attempts >= updated.maxAttempts) {
      throw new AppError({ code: 'OTP_LOCKED', message: 'Превышено количество попыток. Запросите новый код.', statusCode: 429 });
    }
    throw new AppError({ code: 'OTP_INVALID', message: 'Неверный код подтверждения', statusCode: 400 });
  }

  const user = await app.prisma.$transaction(async (tx) => {
    const consumed = await tx.verificationCode.updateMany({
      where: { id: challenge.id, consumedAt: null },
      data: { consumedAt: now },
    });
    if (consumed.count !== 1) {
      throw new AppError({ code: 'OTP_ALREADY_USED', message: 'Код уже использован', statusCode: 400 });
    }

    const existing = await tx.user.findUnique({
      where: { phone: input.phone },
      include: publicUserInclude,
    });

    if (existing?.status === 'SUSPENDED' || existing?.status === 'DELETED') {
      throw new AppError({ code: 'ACCOUNT_UNAVAILABLE', message: 'Учётная запись недоступна', statusCode: 403 });
    }

    if (existing) {
      return tx.user.update({
        where: { id: existing.id },
        data: { phoneVerifiedAt: existing.phoneVerifiedAt ?? now, lastLoginAt: now },
        include: publicUserInclude,
      });
    }

    return tx.user.create({
      data: {
        phone: input.phone,
        phoneVerifiedAt: now,
        lastLoginAt: now,
      },
      include: publicUserInclude,
    });
  });

  let hydratedUser = user;
  let preferredOrganizationId: string | null = null;
  if (user.profileCompletedAt && user.memberships.length === 0 && !input.invitationToken) {
    preferredOrganizationId = await ensureUserWorkspace(app, user.id, user.displayName ?? '');
    hydratedUser = await app.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: publicUserInclude,
    });
  }

  const session = await issueSession(app, user.id, request, preferredOrganizationId);
  const needsRegistration = input.mode === 'login' && !user.profileCompletedAt;

  await app.prisma.auditLog.create({
    data: {
      actorUserId: user.id,
      action: 'auth.otp_verified',
      entityType: 'user',
      entityId: user.id,
      metadata: { mode: input.mode, profileCompleted: Boolean(user.profileCompletedAt) },
      ipAddress: request.ip,
      userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
    },
  });

  return {
    ok: true,
    token: session.token,
    expires_at: session.expiresAt.toISOString(),
    needs_registration: needsRegistration,
    user: presentUser(hydratedUser, session.activeOrganizationId),
  };
}

export async function completeUserProfile(
  app: FastifyInstance,
  request: FastifyRequest,
  auth: AuthContext,
  input: { phone: string; firstName: string; lastName: string; email?: string; tariff?: string | null; invitationToken?: string | null },
) {
  if (input.phone !== auth.user.phone) {
    throw new AppError({
      code: 'PHONE_MISMATCH',
      message: 'Подтверждённый номер не совпадает с номером профиля',
      statusCode: 401,
    });
  }

  const normalizedEmail = input.email?.trim().toLowerCase() || null;
  if (normalizedEmail) {
    const emailOwner = await app.prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });
    if (emailOwner && emailOwner.id !== auth.userId) {
      throw new AppError({ code: 'EMAIL_TAKEN', message: 'Этот email уже используется', statusCode: 409 });
    }
  }

  const now = new Date();
  const displayName = `${input.firstName} ${input.lastName}`.trim();
  await app.prisma.user.update({
    where: { id: auth.userId },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      displayName,
      email: normalizedEmail,
      profileCompletedAt: now,
      phoneVerifiedAt: now,
    },
  });

  let organizationId: string;
  if (input.invitationToken) {
    const accepted = await acceptTeamInvitation(app, request, auth.userId, input.invitationToken);
    organizationId = accepted.membership.organizationId;
  } else {
    organizationId = await ensureUserWorkspace(app, auth.userId, displayName);
  }
  const user = await app.prisma.user.findUniqueOrThrow({
    where: { id: auth.userId },
    include: publicUserInclude,
  });

  await app.prisma.session.update({ where: { id: auth.sessionId }, data: { revokedAt: now } });
  const replacement = await issueSession(app, auth.userId, request, organizationId);

  await app.prisma.auditLog.create({
    data: {
      actorUserId: auth.userId,
      action: 'auth.profile_completed',
      entityType: 'user',
      entityId: auth.userId,
      ...(input.tariff ? { metadata: { requestedTariff: input.tariff } } : {}),
      ipAddress: request.ip,
      userAgent: String(request.headers['user-agent'] ?? '').slice(0, 2048),
    },
  });

  return {
    ok: true,
    token: replacement.token,
    expires_at: replacement.expiresAt.toISOString(),
    user: presentUser(user, replacement.activeOrganizationId),
  };
}

export async function revokeToken(app: FastifyInstance, token: string): Promise<void> {
  if (!token) return;
  await app.prisma.session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(app: FastifyInstance, userId: string): Promise<number> {
  const result = await app.prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export function tokenFromRequest(request: FastifyRequest): string {
  const authorization = request.headers.authorization ?? '';
  const [scheme, token] = authorization.split(/\s+/, 2);
  if (scheme?.toLowerCase() === 'bearer' && token) return token.trim();
  return readCookie(request.headers.cookie, env.AUTH_COOKIE_NAME);
}
