import type { FastifyInstance } from 'fastify';
import { AppError } from '../../core/errors/app-error.js';
import { env } from '../../config/env.js';

type OtpDeliveryInput = {
  phone: string;
  code: string;
  challengeId: string;
  ttlSeconds: number;
};

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
    throw new AppError({
      code: 'OTP_DELIVERY_FAILED',
      message: 'Не удалось отправить код подтверждения',
      statusCode: 502,
    });
  }

  if (!response.ok) {
    app.log.error(
      { statusCode: response.status, challengeId: input.challengeId },
      'OTP webhook rejected delivery',
    );
    throw new AppError({
      code: 'OTP_DELIVERY_FAILED',
      message: 'Не удалось отправить код подтверждения',
      statusCode: 502,
    });
  }
}
