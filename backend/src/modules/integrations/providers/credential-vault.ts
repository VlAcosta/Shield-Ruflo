import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AppError } from '../../../core/errors/app-error.js';
import {
  decryptCredentialSecret,
  encryptCredentialSecret,
} from '../../../shared/security/credential-cipher.js';

export function encryptIntegrationSecret(value: string): string {
  return encryptCredentialSecret(value);
}

export function decryptIntegrationSecret(value: string): string {
  try {
    return decryptCredentialSecret(value);
  } catch (error) {
    if (error instanceof AppError && error.code === 'CREDENTIAL_FORMAT_UNSUPPORTED') {
      throw new AppError({
        code: 'INTEGRATION_CREDENTIAL_FORMAT_UNSUPPORTED',
        message: 'Формат credential интеграции не поддерживается',
        statusCode: 500,
      });
    }
    if (error instanceof AppError && error.code === 'CREDENTIAL_DECRYPT_FAILED') {
      throw new AppError({
        code: 'INTEGRATION_CREDENTIAL_DECRYPT_FAILED',
        message: 'Не удалось расшифровать credential интеграции',
        statusCode: 500,
      });
    }
    throw error;
  }
}

type CredentialPrisma = Pick<PrismaClient, 'integrationAccount'>;

export async function loadIntegrationCredentialsFromPrisma(
  prisma: CredentialPrisma,
  organizationId: string,
  accountId: string,
): Promise<Record<string, string>> {
  const account = await prisma.integrationAccount.findFirst({
    where: { id: accountId, organizationId },
    select: {
      credentials: {
        select: { key: true, encryptedValue: true },
      },
    },
  });
  if (!account) {
    throw new AppError({ code: 'INTEGRATION_NOT_FOUND', message: 'Интеграция не найдена', statusCode: 404 });
  }

  return Object.fromEntries(
    account.credentials.map((credential) => [credential.key, decryptIntegrationSecret(credential.encryptedValue)]),
  );
}

export async function loadIntegrationCredentials(
  app: FastifyInstance,
  organizationId: string,
  accountId: string,
): Promise<Record<string, string>> {
  return loadIntegrationCredentialsFromPrisma(app.prisma, organizationId, accountId);
}
