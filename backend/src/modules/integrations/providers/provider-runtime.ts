import type { FastifyInstance } from 'fastify';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../../core/errors/app-error.js';
import { asProviderAdapterError, ProviderAdapterError } from './provider.errors.js';
import { providerRegistry } from './provider.registry.js';
import { loadIntegrationCredentials } from './credential-vault.js';
import type { ProviderConnectionContext } from './provider.types.js';

function configurationObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asJson(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function recordFailure(
  app: FastifyInstance,
  organizationId: string,
  accountId: string,
  error: { code: string; message: string },
) {
  await app.prisma.$transaction([
    app.prisma.integrationAccount.update({
      where: { id: accountId },
      data: { status: 'ERROR', lastErrorCode: error.code, lastErrorMessage: error.message },
    }),
    app.prisma.integrationEvent.create({
      data: {
        organizationId,
        accountId,
        type: 'connection.failed',
        payload: { code: error.code, message: error.message },
      },
    }),
  ]);
}

function unavailableError(providerId: string, reasonCode?: string, reasonMessage?: string): AppError {
  return new AppError({
    code: reasonCode || 'PROVIDER_ADAPTER_NOT_CONFIGURED',
    message: reasonMessage || `Production adapter для ${providerId} не настроен`,
    statusCode: 422,
  });
}

function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const providerError = asProviderAdapterError(error);
  return new AppError({
    code: providerError.code,
    message: providerError.message,
    statusCode: providerError.statusCode,
    details: { retryable: providerError.retryable },
  });
}

export async function buildProviderContext(
  app: FastifyInstance,
  organizationId: string,
  account: {
    id: string;
    provider: string;
    externalAccountId: string | null;
    configuration: unknown;
  },
): Promise<ProviderConnectionContext> {
  return {
    organizationId,
    accountId: account.id,
    provider: account.provider,
    externalAccountId: account.externalAccountId,
    configuration: configurationObject(account.configuration),
    credentials: await loadIntegrationCredentials(app, organizationId, account.id),
  };
}

export async function connectProviderAccount(
  app: FastifyInstance,
  organizationId: string,
  account: {
    id: string;
    provider: string;
    externalAccountId: string | null;
    configuration: unknown;
  },
) {
  const adapter = providerRegistry.get(account.provider);
  if (!adapter) {
    const error = unavailableError(account.provider);
    await recordFailure(app, organizationId, account.id, error);
    throw error;
  }

  const availability = adapter.availability();
  if (!availability.configured || !availability.connectable) {
    const error = unavailableError(account.provider, availability.reasonCode, availability.reasonMessage);
    await recordFailure(app, organizationId, account.id, error);
    throw error;
  }

  await app.prisma.integrationAccount.update({
    where: { id: account.id },
    data: { status: 'CONNECTING', lastErrorCode: null, lastErrorMessage: null },
  });

  try {
    const context = await buildProviderContext(app, organizationId, account);
    const result = await adapter.connect(context);
    if (result.verified !== true || !['CONNECTED', 'DEGRADED'].includes(result.health)) {
      throw new ProviderAdapterError({
        code: 'PROVIDER_CONNECTION_NOT_VERIFIED',
        message: 'Провайдер не подтвердил подключение',
        statusCode: 502,
      });
    }

    const validatedAt = result.validatedAt ?? new Date();
    const currentConfiguration = configurationObject(account.configuration);
    const nextConfiguration = result.configuration
      ? { ...currentConfiguration, ...result.configuration }
      : currentConfiguration;

    const updated = await app.prisma.integrationAccount.update({
      where: { id: account.id },
      data: {
        status: result.health,
        lastValidatedAt: validatedAt,
        lastErrorCode: null,
        lastErrorMessage: null,
        ...(result.externalAccountId ? { externalAccountId: result.externalAccountId } : {}),
        configuration: asJson(nextConfiguration),
      },
      include: { credentials: { select: { key: true } } },
    });

    await app.prisma.integrationEvent.create({
      data: {
        organizationId,
        accountId: account.id,
        type: 'connection.verified',
        payload: {
          provider: adapter.id,
          health: result.health,
          capabilities: [...adapter.capabilities],
          validatedAt: validatedAt.toISOString(),
        },
      },
    });

    return updated;
  } catch (error) {
    const appError = toAppError(error);
    await recordFailure(app, organizationId, account.id, appError);
    throw appError;
  }
}

export async function disconnectProviderAccount(
  app: FastifyInstance,
  organizationId: string,
  account: {
    id: string;
    provider: string;
    status: string;
    externalAccountId: string | null;
    configuration: unknown;
  },
) {
  const requiresProviderConfirmation = ['CONNECTING', 'CONNECTED', 'DEGRADED'].includes(account.status);

  if (requiresProviderConfirmation) {
    const adapter = providerRegistry.get(account.provider);
    if (!adapter) {
      const error = unavailableError(account.provider);
      await recordFailure(app, organizationId, account.id, error);
      throw error;
    }

    const availability = adapter.availability();
    if (!availability.configured || !availability.connectable) {
      const error = unavailableError(account.provider, availability.reasonCode, availability.reasonMessage);
      await recordFailure(app, organizationId, account.id, error);
      throw error;
    }

    if (!adapter.disconnect) {
      const error = new AppError({
        code: 'PROVIDER_DISCONNECT_UNSUPPORTED',
        message: 'Провайдер не поддерживает подтверждённое отключение через текущий adapter',
        statusCode: 422,
      });
      await recordFailure(app, organizationId, account.id, error);
      throw error;
    }

    try {
      const context = await buildProviderContext(app, organizationId, account);
      const result = await adapter.disconnect(context);
      if (result.confirmed !== true) {
        throw new ProviderAdapterError({
          code: 'PROVIDER_DISCONNECT_NOT_CONFIRMED',
          message: 'Провайдер не подтвердил отключение интеграции',
          statusCode: 502,
        });
      }
    } catch (error) {
      const appError = toAppError(error);
      await recordFailure(app, organizationId, account.id, appError);
      throw appError;
    }
  }

  const updated = await app.prisma.integrationAccount.update({
    where: { id: account.id },
    data: { status: 'DISCONNECTED', lastErrorCode: null, lastErrorMessage: null },
    include: { credentials: { select: { key: true } } },
  });
  await app.prisma.integrationEvent.create({
    data: {
      organizationId,
      accountId: account.id,
      type: requiresProviderConfirmation ? 'connection.disconnected.verified' : 'connection.disconnected',
    },
  });
  return updated;
}

export function providerDiagnostics(providerId: string) {
  const adapter = providerRegistry.get(providerId);
  if (!adapter) {
    return {
      installed: false,
      capabilities: [] as string[],
      availability: {
        configured: false,
        connectable: false,
        reasonCode: 'PROVIDER_ADAPTER_NOT_CONFIGURED',
        reasonMessage: 'Production provider adapter is not installed',
      },
    };
  }
  return {
    installed: true,
    capabilities: [...adapter.capabilities],
    availability: adapter.availability(),
  };
}
