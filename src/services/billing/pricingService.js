import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

const request = async (path, options = {}, timeout = 6000) => {
  if (!API_BASE) throw new TypeError('Billing API is not configured');
  return apiRequest(joinEndpoint(API_BASE, path), { ...options, timeout });
};

export const pricingService = {
  async getCatalog({ signal } = {}) {
    const payload = await request('/billing/catalog', { signal });
    return Array.isArray(payload?.plans) ? payload.plans : [];
  },

  async getPurchaseOptions({ signal } = {}) {
    return request('/billing/purchase-options', { signal, retries: 0 });
  },

  async validatePromo(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return { valid: false, discount: 0, message: 'Введите промокод' };

    const result = await request('/billing/subscription/promo/validate', {
      method: 'POST',
      body: { code: normalized },
    });
    return {
      valid: Boolean(result?.valid),
      discount: Number(result?.discount || 0),
      message: result?.valid ? 'Промокод применён' : 'Промокод недоступен',
      reason: result?.reason || null,
    };
  },

  async createCheckout(payload) {
    // Authentication is server-owned through the HttpOnly session cookie.
    // Never create a local/demo checkout on provider or network failure.
    const result = await request('/billing/subscription/checkout', {
      method: 'POST',
      body: payload,
      idempotencyKey: createIdempotencyKey('pricing-checkout'),
    }, 10_000);

    // Compatibility with the existing pricing UI: a sales-assisted response may
    // navigate to the recorded request's internal continuation page. This is
    // explicitly not a payment-provider checkout URL and never means payment or
    // subscription activation succeeded.
    if (
      result?.mode === 'SALES_ASSISTED'
      && result?.paymentCreated === false
      && result?.subscriptionActivated === false
      && result?.nextAction?.url
    ) {
      return { ...result, checkout_url: result.nextAction.url, checkout_kind: 'sales_assisted_continuation' };
    }

    return result;
  },
};
