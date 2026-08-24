import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { encryptIntegrationSecret } from './providers/credential-vault.js';
import { connectProviderAccount, disconnectProviderAccount } from './providers/provider-runtime.js';
import { providerRegistry } from './providers/provider.registry.js';
import { nextIntegrationSyncAt } from './integration-scheduler.service.js';

const DEFAULT_SYNC_INTERVAL_MINUTES = 30;

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function publicAccount(account: {
  id: string;
  provider: string;
  name: string;
  externalAccountId: string | null;
  status: string;
  configuration: unknown;
  lastValidatedAt: Date | null;
  lastSyncedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
  credentials?: Array<{ key: string }>;
}) {
  const configuration = configObject(account.configuration);
  const syncEnabled = configuration.syncEnabled !== false;
  const requestedInterval = Number(configuration.syncIntervalMinutes);
  const syncIntervalMinutes = Number.isFinite(requestedInterval)
    ? Math.max(5, Math.min(1440, Math.round(requestedInterval)))
    : DEFAULT_SYNC_INTERVAL_MINUTES;
  return {
    id: account.id,
    provider: account.provider,
    name: account.name,
    externalAccountId: account.externalAccountId,
    status: account.status,
    configuration: account.configuration,
    lastValidatedAt: account.lastValidatedAt,
    lastSyncedAt: account.lastSyncedAt,
    lastErrorCode: account.lastErrorCode,
    lastErrorMessage: account.lastErrorMessage,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    credentialKeys: account.credentials?.map((item) => item.key) ?? [],
    syncPolicy: {
      enabled: syncEnabled,
      intervalMinutes: syncIntervalMinutes,
      nextSyncAt: syncEnabled
        ? nextIntegrationSyncAt(account.lastSyncedAt, configuration, syncIntervalMinutes)?.toISOString() ?? null
        : null,
    },
  };
}

export async function listIntegrationAccounts(app: FastifyInstance, organizationId: string) {
  const accounts = await app.prisma.integrationAccount.findMany({
    where: { organizationId },
    include: { credentials: { select: { key: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return accounts.map(publicAccount);
}

export function listProviderCatalog() {
  return providerRegistry.list();
}

export type CreateIntegrationAccountInput = {
  provider: string;
  name: string;
  externalAccountId?: string | undefined;
  configuration?: Record<string, unknown> | undefined;
};

export async function createIntegrationAccount(
  app: FastifyInstance,
  organizationId: string,
  input: CreateIntegrationAccountInput,
) {
  const data: Prisma.IntegrationAccountUncheckedCreateInput = {
    organizationId,
    provider: input.provider.trim().toLowerCase(),
    name: input.name,
    status: 'DISCONNECTED',
    ...(input.externalAccountId ? { externalAccountId: input.externalAccountId } : {}),
    ...(input.configuration ? { configuration: toJson(input.configuration) } : {}),
  };

  const account = await app.prisma.integrationAccount.create({
    data,
    include: { credentials: { select: { key: true } } },
  });
  return publicAccount(account);
}

export async function saveIntegrationCredentials(
  app: FastifyInstance,
  organizationId: string,
  accountId: string,
  credentials: Record<string, string>,
) {
  const account = await app.prisma.integrationAccount.findFirst({ where: { id: accountId, organizationId }, select: { id: true } });
  if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });

  await app.prisma.$transaction(
    Object.entries(credentials).map(([key, value]) =>
      app.prisma.integrationCredential.upsert({
        where: { accountId_key: { accountId, key } },
        update: { encryptedValue: encryptIntegrationSecret(value), keyVersion: 1 },
        create: { accountId, key, encryptedValue: encryptIntegrationSecret(value), keyVersion: 1 },
      }),
    ),
  );

  await app.prisma.integrationEvent.create({
    data: { organizationId, accountId, type: 'credentials.updated', payload: { keys: Object.keys(credentials) } },
  });
  return { configured: true, keys: Object.keys(credentials) };
}

export async function updateIntegrationSetup(
  app: FastifyInstance,
  organizationId: string,
  accountId: string,
  input: {
    configuration?: Record<string, unknown>;
    credentials?: Record<string, string>;
    externalAccountId?: string;
    name?: string;
  },
) {
  const account = await app.prisma.integrationAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });
  const configuration = { ...configObject(account.configuration), ...(input.configuration ?? {}) };
  await app.prisma.integrationAccount.update({
    where: { id: account.id },
    data: {
      configuration: toJson(configuration),
      ...(input.externalAccountId !== undefined ? { externalAccountId: input.externalAccountId || null } : {}),
      ...(input.name ? { name: input.name.slice(0, 180) } : {}),
      lastErrorCode: null,
      lastErrorMessage: null,
    },
  });
  if (input.credentials && Object.keys(input.credentials).length) {
    await saveIntegrationCredentials(app, organizationId, account.id, input.credentials);
  }
  return app.prisma.integrationAccount.findFirst({
    where: { id: account.id, organizationId },
    include: { credentials: { select: { key: true } } },
  });
}

export async function updateIntegrationSyncPolicy(
  app: FastifyInstance,
  organizationId: string,
  accountId: string,
  input: { enabled: boolean; intervalMinutes: number },
) {
  const account = await app.prisma.integrationAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });
  const adapter = providerRegistry.get(account.provider);
  if (input.enabled && (!adapter || !adapter.capabilities.includes('reviews.read') || !adapter.syncReviews)) {
    throw new AppError({
      code: 'PROVIDER_SCHEDULED_SYNC_UNAVAILABLE',
      message: 'Для этой площадки автоматический импорт отзывов недоступен через официальный provider contract',
      statusCode: 422,
    });
  }
  const configuration = {
    ...configObject(account.configuration),
    syncEnabled: input.enabled,
    syncIntervalMinutes: Math.max(5, Math.min(1440, Math.round(input.intervalMinutes))),
  };
  const updated = await app.prisma.integrationAccount.update({
    where: { id: account.id },
    data: { configuration: toJson(configuration) },
    include: { credentials: { select: { key: true } } },
  });
  await app.prisma.integrationEvent.create({
    data: {
      organizationId,
      accountId: account.id,
      type: 'sync.policy.updated',
      payload: { enabled: input.enabled, intervalMinutes: configuration.syncIntervalMinutes },
    },
  });
  return publicAccount(updated);
}

export async function requestIntegrationConnect(app: FastifyInstance, organizationId: string, accountId: string) {
  const account = await app.prisma.integrationAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });

  const connected = await connectProviderAccount(app, organizationId, account);
  return { integration: publicAccount(connected) };
}

export async function disconnectIntegration(app: FastifyInstance, organizationId: string, accountId: string) {
  const account = await app.prisma.integrationAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });

  const updated = await disconnectProviderAccount(app, organizationId, account);
  return publicAccount(updated);
}

export async function queueIntegrationSync(
  app: FastifyInstance,
  organizationId: string,
  accountId: string,
  trigger: 'manual' | 'schedule' = 'manual',
) {
  const account = await app.prisma.integrationAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });
  if (!['CONNECTED', 'DEGRADED'].includes(account.status)) {
    throw new AppError({ code: 'INTEGRATION_NOT_CONNECTED', message: 'Интеграция не подключена', statusCode: 409 });
  }

  const adapter = providerRegistry.get(account.provider);
  const availability = adapter?.availability();
  if (!adapter || !availability?.configured || !availability.connectable) {
    throw new AppError({
      code: availability?.reasonCode || 'PROVIDER_ADAPTER_NOT_CONFIGURED',
      message: availability?.reasonMessage || 'Production provider adapter не настроен',
      statusCode: 422,
    });
  }
  if (!adapter.capabilities.includes('reviews.read') || !adapter.syncReviews) {
    throw new AppError({
      code: 'PROVIDER_CAPABILITY_UNAVAILABLE',
      message: 'Провайдер не поддерживает синхронизацию текстов отзывов',
      statusCode: 422,
    });
  }

  return app.prisma.$transaction(async (tx) => {
    const lockKey = `integration-sync:${accountId}`;
    await tx.$queryRaw<Array<{ acquired: number }>>`SELECT 1::int AS acquired FROM (SELECT pg_advisory_xact_lock(hashtext(${lockKey}), 0)) AS advisory_lock`;

    const currentAccount = await tx.integrationAccount.findFirst({ where: { id: accountId, organizationId } });
    if (!currentAccount) {
      throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });
    }
    if (!['CONNECTED', 'DEGRADED'].includes(currentAccount.status)) {
      throw new AppError({ code: 'INTEGRATION_NOT_CONNECTED', message: 'Интеграция не подключена', statusCode: 409 });
    }

    const active = await tx.integrationSyncRun.findFirst({
      where: { accountId, status: { in: ['QUEUED', 'RUNNING'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (active) return active;

    const run = await tx.integrationSyncRun.create({
      data: { organizationId, accountId, status: 'QUEUED', trigger },
    });
    await tx.job.create({
      data: {
        organizationId,
        type: 'integration.sync.reviews',
        payload: { accountId, syncRunId: run.id, trigger },
        dedupeKey: `integration-sync:${accountId}:${run.id}`,
        maxAttempts: 5,
      },
    });
    return run;
  });
}
