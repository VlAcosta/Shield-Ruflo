import { apiRequest } from '../core/apiClient';
import { pricingService } from './pricingService';

vi.mock('../core/apiClient', () => ({
  apiRequest: vi.fn(),
  createIdempotencyKey: vi.fn(() => 'pricing-key'),
  joinEndpoint: (base, path) => `${base}${path}`,
}));

vi.mock('../core/runtimeEnv', () => ({
  getRuntimeEnv: (_key, fallback) => fallback || '/api/v1',
}));

describe('pricingService production contract', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    localStorage.clear();
  });

  test('reads the public four-tier catalog from backend', async () => {
    apiRequest.mockResolvedValue({ plans: [{ code: 'START' }, { code: 'GROWTH' }, { code: 'PRO' }, { code: 'BUSINESS' }] });
    await expect(pricingService.getCatalog()).resolves.toHaveLength(4);
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/billing/catalog', expect.objectContaining({ timeout: 6000 }));
  });

  test('uses the server subscription checkout endpoint and HttpOnly session contract', async () => {
    apiRequest.mockResolvedValue({ checkout_url: 'https://payment.example.test/session' });
    await expect(pricingService.createCheckout({ planId: 'GROWTH' })).resolves.toMatchObject({ checkout_url: expect.any(String) });
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/billing/subscription/checkout', expect.objectContaining({
      method: 'POST',
      body: { planId: 'GROWTH' },
      idempotencyKey: 'pricing-key',
      timeout: 10000,
    }));
    const options = apiRequest.mock.calls[0][1];
    expect(options.headers?.Authorization).toBeUndefined();
  });

  test('never creates a fake checkout when the provider is unavailable', async () => {
    const error = Object.assign(new Error('provider unavailable'), { status: 503 });
    apiRequest.mockRejectedValue(error);
    await expect(pricingService.createCheckout({ planId: 'PRO' })).rejects.toBe(error);
    expect(localStorage.getItem('business-shield:pending-checkout')).toBeNull();
  });

  test('does not accept a hardcoded promo after a backend failure', async () => {
    apiRequest.mockRejectedValue(new Error('offline'));
    await expect(pricingService.validatePromo('SHIELD10')).rejects.toThrow('offline');
  });
});
