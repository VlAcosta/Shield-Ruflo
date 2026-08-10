import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashOtpCode, hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|p1|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('P1 auth integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

function cookieToken(setCookie: string): string {
  const pair = setCookie.split(';', 1)[0] ?? '';
  const separator = pair.indexOf('=');
  return separator < 0 ? '' : decodeURIComponent(pair.slice(separator + 1));
}

function phoneFor(suffix: number): string {
  return `+79${String(Date.now()).slice(-8)}${suffix}`;
}

describeWithPostgres('P1 auth and session security', () => {
  let app: FastifyInstance;
  const userIds: string[] = [];
  const organizationIds: string[] = [];

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    if (!app) return;
    if (userIds.length) await app.prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (organizationIds.length) await app.prisma.organization.deleteMany({ where: { id: { in: organizationIds } } });
    await app.close();
  });

  it('persists only a hash of the session credential and permits a challenge to be consumed once', async () => {
    const phone = phoneFor(1);
    const challengeId = randomUUID();
    const code = '8462';
    await app.prisma.verificationCode.create({
      data: {
        id: challengeId,
        phone,
        purpose: 'SIGN_IN',
        codeHash: hashOtpCode({ secret: env.AUTH_SECRET, challengeId, phone, purpose: 'SIGN_IN', code }),
        maxAttempts: 5,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const responses = await Promise.all([
      app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { phone, code, session_id: challengeId } }),
      app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { phone, code, session_id: challengeId } }),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 400]);

    const success = responses.find((response) => response.statusCode === 200)!;
    expect(success.json()).not.toHaveProperty('token');
    const rawToken = cookieToken(String(success.headers['set-cookie'] ?? ''));
    expect(rawToken.length).toBeGreaterThanOrEqual(40);
    const session = await app.prisma.session.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(rawToken) } });
    userIds.push(session.userId);
    expect(session.tokenHash).not.toBe(rawToken);
    expect(JSON.stringify(await app.prisma.session.findUniqueOrThrow({ where: { id: session.id } }))).not.toContain(rawToken);
    await expect(app.prisma.verificationCode.findUniqueOrThrow({ where: { id: challengeId } }))
      .resolves.toMatchObject({ consumedAt: expect.any(Date) });
  });

  it('enforces OTP expiry, attempt locking, and resend cooldown', async () => {
    const expiredPhone = phoneFor(2);
    const expiredId = randomUUID();
    await app.prisma.verificationCode.create({
      data: {
        id: expiredId,
        phone: expiredPhone,
        purpose: 'SIGN_IN',
        codeHash: hashOtpCode({ secret: env.AUTH_SECRET, challengeId: expiredId, phone: expiredPhone, purpose: 'SIGN_IN', code: '8123' }),
        expiresAt: new Date(Date.now() - 1),
      },
    });
    const expired = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { phone: expiredPhone, code: '8123', session_id: expiredId },
    });
    expect(expired.statusCode).toBe(400);
    expect(expired.json()).toMatchObject({ error: { code: 'OTP_EXPIRED' } });

    const lockedPhone = phoneFor(3);
    const lockedId = randomUUID();
    await app.prisma.verificationCode.create({
      data: {
        id: lockedId,
        phone: lockedPhone,
        purpose: 'SIGN_IN',
        codeHash: hashOtpCode({ secret: env.AUTH_SECRET, challengeId: lockedId, phone: lockedPhone, purpose: 'SIGN_IN', code: '9345' }),
        maxAttempts: 3,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    for (const expected of [400, 400, 429]) {
      const response = await app.inject({
        method: 'POST', url: '/api/v1/auth/login', payload: { phone: lockedPhone, code: '0000', session_id: lockedId },
      });
      expect(response.statusCode).toBe(expected);
    }
    const afterLock = await app.inject({
      method: 'POST', url: '/api/v1/auth/login', payload: { phone: lockedPhone, code: '9345', session_id: lockedId },
    });
    expect(afterLock.statusCode).toBe(429);
    expect(afterLock.json()).toMatchObject({ error: { code: 'OTP_LOCKED' } });

    const cooldownPhone = phoneFor(4);
    await app.prisma.verificationCode.create({
      data: {
        phone: cooldownPhone,
        purpose: 'SIGN_IN',
        codeHash: 'a'.repeat(64),
        requestIp: '127.0.0.1',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    const cooldown = await app.inject({
      method: 'POST', url: '/api/v1/auth/request-code', payload: { phone: cooldownPhone, mode: 'login' },
    });
    expect(cooldown.statusCode).toBe(429);
    expect(cooldown.json()).toMatchObject({ error: { code: 'OTP_COOLDOWN' } });
    expect(cooldown.json().error.details.retryAfter).toBeGreaterThan(0);
  });

  it('serializes simultaneous request-code calls for the same phone and IP', async () => {
    const phone = phoneFor(7);
    const before = await app.prisma.verificationCode.count({ where: { phone } });
    const responses = await Promise.all(Array.from({ length: 6 }, () => app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-code',
      payload: { phone, mode: 'login' },
    })));

    expect(responses.filter((response) => response.statusCode === 200)).toHaveLength(1);
    expect(responses.filter((response) => response.statusCode === 429)).toHaveLength(5);
    for (const response of responses.filter((candidate) => candidate.statusCode === 429)) {
      expect(response.json()).toMatchObject({ error: { code: 'OTP_COOLDOWN' } });
    }
    await expect(app.prisma.verificationCode.count({ where: { phone } })).resolves.toBe(before + 1);

    const remainingCooldown = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/request-code',
      payload: { phone, mode: 'login' },
    });
    expect(remainingCooldown.statusCode).toBe(429);
    expect(remainingCooldown.json()).toMatchObject({ error: { code: 'OTP_COOLDOWN' } });
  });

  it('caps concurrent invalid attempts and cannot accept the valid code after the lock is reached', async () => {
    const phone = phoneFor(8);
    const challengeId = randomUUID();
    const code = '8462';
    const maxAttempts = 3;
    await app.prisma.verificationCode.create({
      data: {
        id: challengeId,
        phone,
        purpose: 'SIGN_IN',
        codeHash: hashOtpCode({ secret: env.AUTH_SECRET, challengeId, phone, purpose: 'SIGN_IN', code }),
        maxAttempts,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const invalidResponses = await Promise.all(Array.from({ length: 8 }, () => app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone, code: '0000', session_id: challengeId },
    })));
    expect(invalidResponses.every((response) => response.statusCode === 400 || response.statusCode === 429)).toBe(true);

    const challenge = await app.prisma.verificationCode.findUniqueOrThrow({ where: { id: challengeId } });
    expect(challenge.attempts).toBe(maxAttempts);
    expect(challenge.consumedAt).toBeNull();

    const validAfterLock = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phone, code, session_id: challengeId },
    });
    expect(validAfterLock.statusCode).toBe(429);
    expect(validAfterLock.json()).toMatchObject({ error: { code: 'OTP_LOCKED' } });
    await expect(app.prisma.session.count({ where: { user: { phone } } })).resolves.toBe(0);
  });

  it('rejects expired and revoked sessions and persists logout and logout-all revocation', async () => {
    const userId = randomUUID();
    userIds.push(userId);
    await app.prisma.user.create({ data: { id: userId, phone: phoneFor(5), profileCompletedAt: new Date() } });
    const expiredToken = `p1-expired-${randomUUID()}`;
    const revokedToken = `p1-revoked-${randomUUID()}`;
    const currentToken = `p1-current-${randomUUID()}`;
    const otherToken = `p1-other-${randomUUID()}`;
    await app.prisma.session.createMany({ data: [
      { userId, tokenHash: hashSessionToken(expiredToken), expiresAt: new Date(Date.now() - 1) },
      { userId, tokenHash: hashSessionToken(revokedToken), expiresAt: new Date(Date.now() + 60_000), revokedAt: new Date() },
      { userId, tokenHash: hashSessionToken(currentToken), expiresAt: new Date(Date.now() + 60_000) },
      { userId, tokenHash: hashSessionToken(otherToken), expiresAt: new Date(Date.now() + 60_000) },
    ] });

    for (const token of [expiredToken, revokedToken]) {
      const response = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: `${env.AUTH_COOKIE_NAME}=${token}` } });
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: { code: 'SESSION_INVALID' } });
    }
    const logout = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', headers: { cookie: `${env.AUTH_COOKIE_NAME}=${currentToken}` } });
    expect(logout.statusCode).toBe(204);
    await expect(app.prisma.session.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(currentToken) } }))
      .resolves.toMatchObject({ revokedAt: expect.any(Date) });

    const replacementToken = `p1-replacement-${randomUUID()}`;
    await app.prisma.session.create({ data: { userId, tokenHash: hashSessionToken(replacementToken), expiresAt: new Date(Date.now() + 60_000) } });
    const logoutAll = await app.inject({ method: 'POST', url: '/api/v1/auth/logout-all', headers: { cookie: `${env.AUTH_COOKIE_NAME}=${replacementToken}` } });
    expect(logoutAll.statusCode).toBe(200);
    expect(logoutAll.json().revoked).toBeGreaterThanOrEqual(2);
    await expect(app.prisma.session.count({ where: { userId, revokedAt: null } })).resolves.toBe(0);
  });

  it('rotates the bootstrap session when registration completes', async () => {
    const userId = randomUUID();
    const phone = phoneFor(6);
    const oldToken = `p1-bootstrap-${randomUUID()}`;
    userIds.push(userId);
    await app.prisma.user.create({ data: { id: userId, phone, phoneVerifiedAt: new Date() } });
    await app.prisma.session.create({ data: { userId, tokenHash: hashSessionToken(oldToken), expiresAt: new Date(Date.now() + 60_000) } });

    const registration = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { cookie: `${env.AUTH_COOKIE_NAME}=${oldToken}` },
      payload: { phone, first_name: 'P1', last_name: 'Rotation' },
    });
    expect(registration.statusCode).toBe(200);
    expect(registration.json()).not.toHaveProperty('token');
    const newToken = cookieToken(String(registration.headers['set-cookie'] ?? ''));
    expect(newToken).not.toBe(oldToken);
    await expect(app.prisma.session.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(oldToken) } }))
      .resolves.toMatchObject({ revokedAt: expect.any(Date) });
    const restored = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: `${env.AUTH_COOKIE_NAME}=${newToken}` } });
    expect(restored.statusCode).toBe(200);
    const membership = await app.prisma.organizationMember.findFirstOrThrow({ where: { userId } });
    organizationIds.push(membership.organizationId);
  });
});
