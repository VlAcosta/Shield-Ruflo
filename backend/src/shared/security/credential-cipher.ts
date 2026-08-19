import crypto from 'node:crypto';
import { env } from '../../config/env.js';
import { AppError } from '../../core/errors/app-error.js';

function encryptionKey(): Buffer {
  return crypto.createHash('sha256').update(env.INTEGRATION_CREDENTIALS_KEY, 'utf8').digest();
}

export function encryptCredentialSecret(value: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptCredentialSecret(value: string): string {
  const [version, ivValue, tagValue, encryptedValue] = value.split(':');
  if (version !== 'v1' || !ivValue || !tagValue || !encryptedValue) {
    throw new AppError({
      code: 'CREDENTIAL_FORMAT_UNSUPPORTED',
      message: 'Формат зашифрованного credential не поддерживается',
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
      code: 'CREDENTIAL_DECRYPT_FAILED',
      message: 'Не удалось расшифровать credential',
      statusCode: 500,
    });
  }
}
