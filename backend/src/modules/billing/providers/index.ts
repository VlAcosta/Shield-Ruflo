import { env } from '../../../config/env.js';
import { AppError } from '../../../core/errors/app-error.js';
import type { BillingProvider } from './billing-provider.js';
import { yookassaProvider } from './yookassa.provider.js';

export function getBillingProvider(): BillingProvider {
  if (env.BILLING_PROVIDER === 'yookassa' && yookassaProvider.configured) return yookassaProvider;
  throw new AppError({
    code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
    message: 'Онлайн-оплата пока недоступна: production payment provider не настроен',
    statusCode: 503,
    details: { provider: env.BILLING_PROVIDER },
  });
}

export function isBillingProviderConfigured() {
  return env.BILLING_PROVIDER === 'yookassa' && yookassaProvider.configured;
}
