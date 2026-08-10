import crypto from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { env } from '../../../config/env.js';
import { AppError } from '../../../core/errors/app-error.js';

function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(env.INTEGRATION_CREDENTIALS_KEY, 'utf8').digest();
}

export function encryptIntegrationSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptIntegrationSecret(value: string): string {
  const [version, ivValue, tagValue, encryptedValue] = value.split(':');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    throw new AppError({
      code: 'INTEGRATION_CREDENTIAL_FORMAT_UNSUPPORTED',
      message: 'Формат credential интеграции не поддерживается',
      statusCode: 500,
    });
  }

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new AppError({
      code: 'INTEGRATION_CREDENTIAL_DECRYPT_FAILED',
      message: 'Не удалось расшифровать credential интеграции',
      statusCode: 500,
    });
  }
}

export async function loadIntegrationCredentials(
  app: FastifyInstance,
  organizationId: string,
  accountId: string,
): Promise<Record<string, string>> {
  const account = await app.prisma.integrationAccount.findFirst({
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
