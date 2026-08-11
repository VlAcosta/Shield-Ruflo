import { Buffer } from 'node:buffer';
import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { env } from '../../config/env.js';

type OtpDeliveryInput = {
  phone: string;
  code: string;
  challengeId: string;
  ttlSeconds: number;
};

type SmsAeroResponse = {
  success?: boolean;
  data?: unknown;
  message?: unknown;
};

export function normalizeSmsAeroPhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  if (!/^\d{10,15}$/.test(digits)) {
    throw new Error('Invalid phone number for SMS Aero');
  }
  return digits;
}

export function buildSmsAeroOtpText(code: string, ttlSeconds: number): string {
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

async function deliverViaSmsAero(app: FastifyInstance, input: OtpDeliveryInput): Promise<void> {
  let number: string;
  try {
    number = normalizeSmsAeroPhone(input.phone);
  } catch {
    app.log.warn({ challengeId: input.challengeId }, 'OTP SMS Aero phone normalization failed');
    throw deliveryError();
  }

  const url = new URL('https://gate.smsaero.ru/v2/sms/send');
  url.searchParams.set('number', number);
  url.searchParams.set('text', buildSmsAeroOtpText(input.code, input.ttlSeconds));
  url.searchParams.set('sign', env.SMSAERO_SIGN);

  const authorization = Buffer.from(`${env.SMSAERO_EMAIL}:${env.SMSAERO_API_KEY}`, 'utf8').toString('base64');

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        authorization: `Basic ${authorization}`,
        accept: 'application/json',
      },
      signal: AbortSignal.timeout(env.SMSAERO_TIMEOUT_MS),
    });
  } catch (error) {
    app.log.error({ err: error, challengeId: input.challengeId }, 'OTP SMS Aero request failed');
    throw deliveryError();
  }

  let payload: SmsAeroResponse | null = null;
  try {
    payload = await response.json() as SmsAeroResponse;
  } catch {
    payload = null;
  }

  if (!response.ok || payload?.success !== true) {
    app.log.error(
      {
        statusCode: response.status,
        challengeId: input.challengeId,
        providerAccepted: payload?.success === true,
      },
      'OTP SMS Aero rejected delivery',
    );
    throw deliveryError();
  }

  app.log.info(
    {
      authEvent: 'otp_sms_delivery_accepted',
      provider: 'smsaero',
      phone: input.phone.replace(/.(?=.{4})/g, '*'),
      challengeId: input.challengeId,
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

  if (env.AUTH_OTP_PROVIDER === 'smsaero') {
    await deliverViaSmsAero(app, input);
    return;
  }

  await deliverViaWebhook(app, input);
}
