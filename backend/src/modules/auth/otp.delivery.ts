import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { env } from '../../config/env.js';

type OtpDeliveryInput = {
  phone: string;
  code: string;
  challengeId: string;
  ttlSeconds: number;
};

type SmscResponse = {
  id?: number | string;
  cnt?: number;
  error?: string;
  error_code?: number;
};

export function normalizeSmscPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  if (!/^\d{10,15}$/.test(digits)) {
    throw new Error('Invalid phone number for SMSC');
  }
  return digits;
}

export function buildSmscOtpText(code: string, ttlSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(ttlSeconds / 60));
  return `Business Shield: код ${code}. Никому не сообщайте. Действует ${minutes} мин.`;
}

function deliveryError(): AppError {
  return new AppError({
    code: 'OTP_DELIVERY_FAILED',
    message: 'Не удалось отправить код подтверждения',
    statusCode: 502,
  });
}

async function deliverViaSmsc(app: FastifyInstance, input: OtpDeliveryInput): Promise<void> {
  let phone: string;
  try {
    phone = normalizeSmscPhone(input.phone);
  } catch {
    app.log.warn({ challengeId: input.challengeId }, 'OTP SMSC phone normalization failed');
    throw deliveryError();
  }

  const body = new URLSearchParams({
    apikey: env.SMSC_API_KEY,
    phones: phone,
    mes: buildSmscOtpText(input.code, input.ttlSeconds),
    fmt: '3',
    charset: 'utf-8',
  });

  if (env.SMSC_SENDER) {
    body.set('sender', env.SMSC_SENDER);
  }

  let response: Response;
  try {
    response = await fetch('https://smsc.ru/sys/send.php', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded; charset=utf-8',
        accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(env.SMSC_TIMEOUT_MS),
    });
  } catch (error) {
    app.log.error({ err: error, challengeId: input.challengeId }, 'OTP SMSC request failed');
    throw deliveryError();
  }

  let payload: SmscResponse | null = null;
  try {
    payload = await response.json() as SmscResponse;
  } catch {
    payload = null;
  }

  const accepted = response.ok
    && payload !== null
    && payload.error_code === undefined
    && payload.error === undefined
    && payload.id !== undefined
    && typeof payload.cnt === 'number'
    && payload.cnt > 0;

  if (!accepted) {
    app.log.error(
      {
        statusCode: response.status,
        challengeId: input.challengeId,
        providerErrorCode: payload?.error_code,
        providerAccepted: false,
      },
      'OTP SMSC rejected delivery',
    );
    throw deliveryError();
  }

  app.log.info(
    {
      authEvent: 'otp_sms_delivery_accepted',
      provider: 'smsc',
      phone: input.phone.replace(/.(?=.{4})/g, '*'),
      challengeId: input.challengeId,
      providerMessageId: String(payload.id),
    },
    'OTP delivery accepted by SMS provider',
  );
}

async function deliverViaWebhook(app: FastifyInstance, input: OtpDeliveryInput): Promise<void> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (env.AUTH_OTP_WEBHOOK_TOKEN) {
    headers.authorization = `Bearer ${env.AUTH_OTP_WEBHOOK_TOKEN}`;
  }

  let response: Response;
  try {
    response = await fetch(env.AUTH_OTP_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        phone: input.phone,
        code: input.code,
        challenge_id: input.challengeId,
        ttl_seconds: input.ttlSeconds,
      }),
      signal: AbortSignal.timeout(env.AUTH_OTP_WEBHOOK_TIMEOUT_MS),
    });
  } catch (error) {
    app.log.error({ err: error, challengeId: input.challengeId }, 'OTP webhook request failed');
    throw deliveryError();
  }

  if (!response.ok) {
    app.log.error(
      { statusCode: response.status, challengeId: input.challengeId },
      'OTP webhook rejected delivery',
    );
    throw deliveryError();
  }
}

export async function deliverOtp(app: FastifyInstance, input: OtpDeliveryInput): Promise<void> {
  if (env.AUTH_OTP_PROVIDER === 'console') {
    app.log.warn(
      {
        authEvent: 'otp_console_delivery',
        phone: input.phone.replace(/.(?=.{4})/g, '*'),
        challengeId: input.challengeId,
        otpCode: input.code,
      },
      'Development OTP delivery. Never use console delivery in production.',
    );
    return;
  }

  if (env.AUTH_OTP_PROVIDER === 'smsc') {
    await deliverViaSmsc(app, input);
    return;
  }

  await deliverViaWebhook(app, input);
}