import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../core/errors/app-error.js';
import { encryptIntegrationSecret } from './providers/credential-vault.js';
import { connectProviderAccount } from './providers/provider-runtime.js';
import { providerRegistry } from './providers/provider.registry.js';

function toJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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

export async function requestIntegrationConnect(app: FastifyInstance, organizationId: string, accountId: string) {
  const account = await app.prisma.integrationAccount.findFirst({ where: { id: accountId, organizationId } });
  if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });

  const connected = await connectProviderAccount(app, organizationId, account);
  return { integration: publicAccount(connected) };
}

export async function disconnectIntegration(app: FastifyInstance, organizationId: string, accountId: string) {
  const account = await app.prisma.integrationAccount.findFirst({ where: { id: accountId, organizationId }, select: { id: true } });
  if (!account) throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });
  const updated = await app.prisma.integrationAccount.update({
    where: { id: account.id },
    data: { status: 'DISCONNECTED', lastErrorCode: null, lastErrorMessage: null },
    include: { credentials: { select: { key: true } } },
  });
  await app.prisma.integrationEvent.create({ data: { organizationId, accountId, type: 'connection.disconnected' } });
  return publicAccount(updated);
}

export async function queueIntegrationSync(app: FastifyInstance, organizationId: string, accountId: string) {
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
      message: 'Провайдер не поддерживает синхронизацию отзывов',
      statusCode: 422,
    });
  }

  const active = await app.prisma.integrationSyncRun.findFirst({
    where: { accountId, status: { in: ['QUEUED', 'RUNNING'] } },
    orderBy: { createdAt: 'desc' },
  });
  if (active) return active;

  return app.prisma.$transaction(async (tx) => {
    const run = await tx.integrationSyncRun.create({ data: { organizationId, accountId, status: 'QUEUED', trigger: 'manual' } });
    await tx.job.create({
      data: {
        organizationId,
        type: 'integration.sync.reviews',
        payload: { accountId, syncRunId: run.id },
        dedupeKey: `integration-sync:${accountId}`,
        maxAttempts: 5,
      },
    });
    return run;
  });
}
