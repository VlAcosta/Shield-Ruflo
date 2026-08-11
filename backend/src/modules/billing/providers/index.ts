import { env } from '../../../config/env.js';
import { AppError } from '../../../core/errors/app-error.js';
import type { BillingProvider } from './billing-provider.js';
import { yookassaProvider } from './yookassa.provider.js';

let testProviderOverride: BillingProvider | null = null;

export function getBillingProvider(): BillingProvider {
  if (env.NODE_ENV === 'test' && testProviderOverride) return testProviderOverride;
  if (env.BILLING_PROVIDER === 'yookassa' && yookassaProvider.configured) return yookassaProvider;
  throw new AppError({
    code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
    message: 'Онлайн-оплата пока недоступна: production payment provider не настроен',
    statusCode: 503,
    details: { provider: env.BILLING_PROVIDER, status: 'payment_unavailable' },
  });
}

export function isBillingProviderConfigured() {
  if (env.NODE_ENV === 'test' && testProviderOverride) return testProviderOverride.configured;
  return env.BILLING_PROVIDER === 'yookassa' && yookassaProvider.configured;
}

export function setBillingProviderForTests(provider: BillingProvider | null) {
  if (env.NODE_ENV !== 'test') {
    throw new Error('Billing provider override is available only in NODE_ENV=test');
  }
  testProviderOverride = provider;
}
