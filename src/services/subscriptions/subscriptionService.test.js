import { apiRequest } from '../core/apiClient';
import {
  createSubscriptionCheckout,
  getSubscriptionSnapshot,
  normalizeSubscriptionSnapshot,
} from './subscriptionService';

vi.mock('../core/apiClient', async () => {
  const actual = await vi.importActual('../core/apiClient');
  return {
    ...actual,
    apiRequest: vi.fn(),
    createIdempotencyKey: vi.fn(() => 'subscription-test-idempotency-key'),
  };
});

describe('subscription checkout provider truth', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    localStorage.clear();
  });

  test('maps backend usage meters to UI plan limits', () => {
    const snapshot = normalizeSubscriptionSnapshot({
      plan: { id: 'PRO', name: 'PRO', price: 4990 },
      usage: {
        meters: [
          { key: 'locations', used: 2, limit: 5, state: 'ok', percentage: 40 },
          { key: 'reviews', used: 147, limit: null, state: 'unmetered', percentage: null },
        ],
      },
      packages: [],
      payments: [],
    });

    expect(snapshot.limits).toEqual([
      expect.objectContaining({
        id: 'locations',
        label: 'Точки',
        used: 2,
        total: 5,
        percentage: 40,
      }),
      expect.objectContaining({
        id: 'reviews',
        label: 'Отзывы за месяц',
        used: 147,
        total: null,
        state: 'unmetered',
      }),
    ]);
  });

  test('marks cached billing data as stale when the server cannot confirm it', async () => {
    apiRequest.mockResolvedValueOnce({
      plan: { id: 'FREE', code: 'FREE', name: 'Базовый', price: 0 },
      usage: { meters: [{ key: 'users', used: 1, limit: 3, state: 'ok', percentage: 33 }] },
      packages: [],
      payments: [],
      paymentProviderConfigured: false,
    });

    const live = await getSubscriptionSnapshot();
    expect(live.source).toBe('api');
    expect(live.stale).toBe(false);

    apiRequest.mockRejectedValueOnce(Object.assign(new Error('Billing unavailable'), { status: 503 }));
    const cached = await getSubscriptionSnapshot();

    expect(cached.source).toBe('cache');
    expect(cached.stale).toBe(true);
    expect(cached.snapshot.limits[0]).toEqual(expect.objectContaining({
      id: 'users',
      used: 1,
      total: 3,
    }));
  });

  test('does not fake a successful payment when backend is unavailable', async () => {
    apiRequest.mockRejectedValue(Object.assign(new Error('Платёжный provider не настроен'), {
      code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      status: 503,
    }));

    const result = await createSubscriptionCheckout({ total: 1980 });

    expect(apiRequest).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
    expect(result.status).toBe('payment_unavailable');
    expect(result.paymentId).toBeNull();
    expect(result.redirectUrl).toBeNull();
    expect(result.amount).toBe(1980);
    expect(result.errorCode).toBe('PAYMENT_PROVIDER_NOT_CONFIGURED');
  });
});
