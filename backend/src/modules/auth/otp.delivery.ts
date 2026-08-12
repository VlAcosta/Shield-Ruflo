import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { env } from '../../config/env.js';

type OtpDeliveryInput = {
  phone: string;
  code: string;
  challengeId: string;
  ttlSeconds: number;
};

type ExolveMakeVoiceMessageResponse = {
  call_id?: string;
};

function deliveryError(): AppError {
  return new AppError({
    code: 'OTP_DELIVERY_FAILED',
    message: 'Не удалось отправить код подтверждения',
    statusCode: 502,
  });
}

export function normalizeExolvePhone(phone: string): string {
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) {
    digits = `7${digits.slice(1)}`;
  }
  if (!/^\d{10,15}$/.test(digits)) {
    throw new Error('Invalid phone number for Exolve');
  }
  return digits;
}

export function buildExolveOtpText(code: string, ttlSeconds: number): string {
  const minutes = Math.max(1, Math.ceil(ttlSeconds / 60));
  const spokenCode = code.split('').join('. ');
  return `Business Shield. Код подтверждения: ${spokenCode}. Повторяю: ${spokenCode}. Код действует ${minutes} минут.`;
}

async function deliverViaExolveVoice(app: FastifyInstance, input: OtpDeliveryInput): Promise<void> {
  let destination: string;
  try {
    destination = normalizeExolvePhone(input.phone);
  } catch {
    app.log.warn({ challengeId: input.challengeId }, 'OTP Exolve phone normalization failed');
    throw deliveryError();
  }

  const body = {
    source: env.EXOLVE_SOURCE_NUMBER,
    destination,
    tts: {
      text: buildExolveOtpText(input.code, input.ttlSeconds),
      voice: env.EXOLVE_TTS_VOICE,
      lang: 1,
      volume: -19,
      speed: env.EXOLVE_TTS_SPEED,
      emotion: 1,
    },
  };

  let response: Response;
  try {
    response = await fetch('https://api.exolve.ru/call/v1/MakeVoiceMessage', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.EXOLVE_API_KEY}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(env.EXOLVE_TIMEOUT_MS),
    });
  } catch (error) {
    app.log.error({ err: error, challengeId: input.challengeId }, 'OTP Exolve request failed');
    throw deliveryError();
  }

  let payload: ExolveMakeVoiceMessageResponse | null = null;
  try {
    payload = await response.json() as ExolveMakeVoiceMessageResponse;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.call_id) {
    app.log.error(
      {
        statusCode: response.status,
        challengeId: input.challengeId,
        providerAccepted: Boolean(payload?.call_id),
      },
      'OTP Exolve rejected delivery',
    );
    throw deliveryError();
  }

  app.log.info(
    {
      authEvent: 'otp_voice_delivery_accepted',
      provider: 'exolve',
      phone: input.phone.replace(/.(?=.{4})/g, '*'),
      challengeId: input.challengeId,
      providerCallId: payload.call_id,
    },
    'OTP voice delivery accepted by provider',
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

  if (env.AUTH_OTP_PROVIDER === 'exolve_voice') {
    await deliverViaExolveVoice(app, input);
    return;
  }

  await deliverViaWebhook(app, input);
}
