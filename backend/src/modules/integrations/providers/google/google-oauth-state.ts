import crypto from 'node:crypto';
import { env } from '../../../../config/env.js';
import { AppError } from '../../../../core/errors/app-error.js';
import { GOOGLE_BUSINESS_PROVIDER_ID } from './google-business-profile.adapter.js';

const STATE_TTL_MS = 10 * 60 * 1000;

type GoogleOAuthStatePayload = {
  v: 1;
  provider: typeof GOOGLE_BUSINESS_PROVIDER_ID;
  organizationId: string;
  userId: string;
  accountId: string;
  nonce: string;
  exp: number;
};

function signingKey(): Buffer {
  return crypto
    .createHash('sha256')
    .update(`${env.AUTH_SECRET}:google-business-profile:oauth-state`, 'utf8')
    .digest();
}

function sign(encodedPayload: string): string {
  return crypto.createHmac('sha256', signingKey()).update(encodedPayload, 'utf8').digest('base64url');
}

export function googleOAuthNonceHash(nonce: string): string {
  return crypto.createHash('sha256').update(nonce, 'utf8').digest('hex');
}

export function createGoogleOAuthState(input: {
  organizationId: string;
  userId: string;
  accountId: string;
  now?: number | undefined;
}) {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const payload: GoogleOAuthStatePayload = {
    v: 1,
    provider: GOOGLE_BUSINESS_PROVIDER_ID,
    organizationId: input.organizationId,
    userId: input.userId,
    accountId: input.accountId,
    nonce,
    exp: (input.now ?? Date.now()) + STATE_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return {
    state: `${encoded}.${sign(encoded)}`,
    nonceHash: googleOAuthNonceHash(nonce),
    expiresAt: new Date(payload.exp),
  };
}

export function verifyGoogleOAuthState(state: string, now = Date.now()): GoogleOAuthStatePayload {
  const [encoded, signature, ...rest] = state.split('.');
  if (!encoded || !signature || rest.length) {
    throw new AppError({ code: 'GOOGLE_OAUTH_STATE_INVALID', message: 'Некорректное состояние Google OAuth.', statusCode: 400 });
  }

  const expected = sign(encoded);
  const actualBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    throw new AppError({ code: 'GOOGLE_OAUTH_STATE_INVALID', message: 'Проверка Google OAuth state не пройдена.', statusCode: 400 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    throw new AppError({ code: 'GOOGLE_OAUTH_STATE_INVALID', message: 'Некорректное состояние Google OAuth.', statusCode: 400 });
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError({ code: 'GOOGLE_OAUTH_STATE_INVALID', message: 'Некорректное состояние Google OAuth.', statusCode: 400 });
  }
  const candidate = payload as Partial<GoogleOAuthStatePayload>;
  if (
    candidate.v !== 1
    || candidate.provider !== GOOGLE_BUSINESS_PROVIDER_ID
    || typeof candidate.organizationId !== 'string'
    || typeof candidate.userId !== 'string'
    || typeof candidate.accountId !== 'string'
    || typeof candidate.nonce !== 'string'
    || typeof candidate.exp !== 'number'
  ) {
    throw new AppError({ code: 'GOOGLE_OAUTH_STATE_INVALID', message: 'Некорректное состояние Google OAuth.', statusCode: 400 });
  }
  if (candidate.exp <= now) {
    throw new AppError({ code: 'GOOGLE_OAUTH_STATE_EXPIRED', message: 'Google OAuth state истёк. Начните подключение заново.', statusCode: 400 });
  }
  return candidate as GoogleOAuthStatePayload;
}
