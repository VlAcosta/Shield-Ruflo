import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { env } from '../src/config/env.js';
import { hashSessionToken } from '../src/shared/security/tokens.js';

const integrationDatabaseUrl = process.env.TEST_DATABASE_URL ?? '';
const databaseName = integrationDatabaseUrl ? new URL(integrationDatabaseUrl).pathname.toLowerCase() : '';
const isExplicitTestDatabase = /(?:test|p0|e2e)/.test(databaseName)
  && process.env.DATABASE_URL === integrationDatabaseUrl
  && process.env.NODE_ENV === 'test';
const describeWithPostgres = integrationDatabaseUrl ? describe : describe.skip;

if (integrationDatabaseUrl && !isExplicitTestDatabase) {
  throw new Error('Support integration tests require NODE_ENV=test and matching TEST_DATABASE_URL/DATABASE_URL with a test-only database name');
}

describeWithPostgres('Support chat persistence, RBAC and tenant isolation', () => {
  let app: FastifyInstance;
  const organizationAId = randomUUID();
  const organizationBId = randomUUID();
  const ownerAId = randomUUID();
  const analystAId = randomUUID();
  const ownerBId = randomUUID();
  const ownerAToken = `support-owner-a-${randomUUID()}`;
  const analystAToken = `support-analyst-a-${randomUUID()}`;
  const ownerBToken = `support-owner-b-${randomUUID()}`;
  const ownerACookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(ownerAToken)}`;
  const analystACookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(analystAToken)}`;
  const ownerBCookie = `${env.AUTH_COOKIE_NAME}=${encodeURIComponent(ownerBToken)}`;

  beforeAll(async () => {
    app = await buildApp();

    await app.prisma.organization.createMany({
      data: [
        { id: organizationAId, name: 'Support Organization A', slug: `support-a-${randomUUID()}` },
        { id: organizationBId, name: 'Support Organization B', slug: `support-b-${randomUUID()}` },
      ],
    });

    await app.prisma.user.createMany({
      data: [
        { id: ownerAId, phone: `+7${Date.now()}81`, displayName: 'Support Owner A', profileCompletedAt: new Date() },
        { id: analystAId, phone: `+7${Date.now()}82`, displayName: 'Support Analyst A', profileCompletedAt: new Date() },
        { id: ownerBId, phone: `+7${Date.now()}83`, displayName: 'Support Owner B', profileCompletedAt: new Date() },
      ],
    });

    await app.prisma.organizationMember.createMany({
      data: [
        { organizationId: organizationAId, userId: ownerAId, role: 'OWNER', status: 'ACTIVE' },
        { organizationId: organizationAId, userId: analystAId, role: 'ANALYST', status: 'ACTIVE' },
        { organizationId: organizationBId, userId: ownerBId, role: 'OWNER', status: 'ACTIVE' },
      ],
    });

    await app.prisma.session.createMany({
      data: [
        {
          userId: ownerAId,
          activeOrganizationId: organizationAId,
          tokenHash: hashSessionToken(ownerAToken),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
        {
          userId: analystAId,
          activeOrganizationId: organizationAId,
          tokenHash: hashSessionToken(analystAToken),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
        {
          userId: ownerBId,
          activeOrganizationId: organizationBId,
          tokenHash: hashSessionToken(ownerBToken),
          expiresAt: new Date(Date.now() + 10 * 60_000),
        },
      ],
    });
  });

  afterAll(async () => {
    if (!app) return;
    await app.prisma.organization.deleteMany({ where: { id: { in: [organizationAId, organizationBId] } } });
    await app.prisma.user.deleteMany({ where: { id: { in: [ownerAId, analystAId, ownerBId] } } });
    await app.close();
  });

  it('returns an empty server-authoritative snapshot and persists the selected channel', async () => {
    const initial = await app.inject({
      method: 'GET',
      url: '/api/v1/support',
      headers: { cookie: ownerACookie },
    });
    expect(initial.statusCode).toBe(200);
    expect(initial.json()).toMatchObject({
      snapshot: {
        source: 'api',
        activeChannel: 'manager',
        threads: { manager: [], technical: [] },
      },
    });

    const preference = await app.inject({
      method: 'PATCH',
      url: '/api/v1/support/preferences',
      headers: { cookie: ownerACookie },
      payload: { activeChannel: 'technical' },
    });
    expect(preference.statusCode).toBe(200);
    expect(preference.json().snapshot.activeChannel).toBe('technical');

    const stored = await app.prisma.user.findUniqueOrThrow({
      where: { id: ownerAId },
      select: { supportPreferences: true },
    });
    expect(stored.supportPreferences).toMatchObject({ activeChannel: 'technical' });
  });

  it('persists a client message once when the same idempotency key is retried', async () => {
    const idempotencyKey = `support-message-${randomUUID()}`;
    const send = () => app.inject({
      method: 'POST',
      url: '/api/v1/support/channels/technical/messages',
      headers: { cookie: ownerACookie, 'idempotency-key': idempotencyKey },
      payload: { text: 'Интеграция перестала обновляться', attachments: [] },
    });

    const first = await send();
    const second = await send();

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json().message.id).toBe(first.json().message.id);

    const ticketId = first.json().ticket.id as string;
    await expect(app.prisma.supportMessage.count({ where: { ticketId } })).resolves.toBe(1);
    await expect(app.prisma.supportTicket.findUniqueOrThrow({ where: { id: ticketId } }))
      .resolves.toMatchObject({ organizationId: organizationAId, createdByUserId: ownerAId, adminUnreadCount: 1 });

    const snapshot = await app.inject({
      method: 'GET',
      url: '/api/v1/support',
      headers: { cookie: ownerACookie },
    });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json().snapshot.threads.technical).toEqual([
      expect.objectContaining({
        from: 'client',
        text: 'Интеграция перестала обновляться',
        delivered: true,
      }),
    ]);
  });

  it('stores support attachments privately and enforces tenant-isolated downloads', async () => {
    const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/support/channels/technical/messages',
      headers: { cookie: ownerACookie },
      payload: {
        text: 'Прикладываю скриншот',
        attachments: [{
          name: 'screen.png',
          size: pngBytes.length,
          type: 'image/png',
          dataBase64: pngBytes.toString('base64'),
        }],
      },
    });

    expect(response.statusCode).toBe(201);
    const attachment = response.json().snapshot.threads.technical
      .flatMap((message: any) => message.attachments || [])
      .find((item: any) => item.name === 'screen.png');
    expect(attachment).toMatchObject({
      name: 'screen.png',
      size: pngBytes.length,
      type: 'image/png',
    });
    expect(attachment.downloadUrl).toMatch(/^\/api\/v1\/support\/attachments\//);

    const ownDownload = await app.inject({
      method: 'GET',
      url: attachment.downloadUrl,
      headers: { cookie: ownerACookie },
    });
    expect(ownDownload.statusCode).toBe(200);
    expect(ownDownload.headers['content-type']).toContain('image/png');
    expect(ownDownload.rawPayload).toEqual(pngBytes);

    const foreignDownload = await app.inject({
      method: 'GET',
      url: attachment.downloadUrl,
      headers: { cookie: ownerBCookie },
    });
    expect(foreignDownload.statusCode).toBe(404);
    expect(foreignDownload.json()).toMatchObject({
      error: { code: 'SUPPORT_ATTACHMENT_NOT_FOUND' },
    });
  });

  it('allows read-only support access but denies writing without support.write', async () => {
    const read = await app.inject({
      method: 'GET',
      url: '/api/v1/support',
      headers: { cookie: analystACookie },
    });
    expect(read.statusCode).toBe(200);

    const write = await app.inject({
      method: 'POST',
      url: '/api/v1/support/channels/manager/messages',
      headers: { cookie: analystACookie },
      payload: { text: 'Не должно сохраниться' },
    });
    expect(write.statusCode).toBe(403);
    expect(write.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
  });

  it('never exposes another organization support conversation', async () => {
    const foreignSend = await app.inject({
      method: 'POST',
      url: '/api/v1/support/channels/manager/messages',
      headers: { cookie: ownerBCookie },
      payload: { text: 'Сообщение организации B' },
    });
    expect(foreignSend.statusCode).toBe(201);

    const organizationA = await app.inject({
      method: 'GET',
      url: '/api/v1/support',
      headers: { cookie: ownerACookie },
    });
    const serialized = JSON.stringify(organizationA.json());
    expect(serialized).not.toContain('Сообщение организации B');
    expect(serialized).not.toContain(organizationBId);
  });
});
