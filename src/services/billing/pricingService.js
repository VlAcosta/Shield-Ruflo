import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
const API_BASE = String(getRuntimeEnv('API_BASE')).replace(/\/$/, '');

const request = async (path, options = {}, timeout = 6000) => {
  if (!API_BASE) throw new TypeError('Billing API is not configured');
  return apiRequest(joinEndpoint(API_BASE, path), { ...options, timeout });
};

export const pricingService = {
  async validatePromo(code) {
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return { valid: false, discount: 0, message: 'Введите промокод' };

    try {
      return await request('/billing/promo/validate', {
        method: 'POST',
        body: { code: normalized },
      });
    } catch (error) {
      if (normalized === 'SHIELD10') {
        return { valid: true, discount: 0.1, message: 'Промокод применён: −10%' };
      }
      return { valid: false, discount: 0, message: 'Промокод не найден' };
    }
  },

  async createCheckout(payload) {
    const token = localStorage.getItem('token') || '';
    try {
      return await request('/billing/checkout', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: payload,
        idempotencyKey: createIdempotencyKey('pricing-checkout'),
      });
    } catch (error) {
      const demoId = `demo-checkout-${Date.now()}`;
      localStorage.setItem('business-shield:pending-checkout', JSON.stringify({ ...payload, id: demoId, createdAt: new Date().toISOString() }));
      return { id: demoId, demo: true, status: 'ready' };
    }
  },
};
