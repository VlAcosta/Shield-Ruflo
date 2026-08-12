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
    return request('/billing/subscription/checkout', {
      method: 'POST',
      body: payload,
      idempotencyKey: createIdempotencyKey('pricing-checkout'),
    }, 10_000);
  },
};
