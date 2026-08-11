import { apiRequest } from '../core/apiClient';
import { createSubscriptionCheckout } from './subscriptionService';

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
  });

  test('does not fake a successful payment or amount when backend is unavailable', async () => {
    apiRequest.mockRejectedValue(Object.assign(new Error('Платёжный provider не настроен'), {
      code: 'PAYMENT_PROVIDER_NOT_CONFIGURED',
      status: 503,
    }));

    const result = await createSubscriptionCheckout({ kind: 'plan', planCode: 'PRO' });

    expect(apiRequest).toHaveBeenCalledTimes(1);
    const [, request] = apiRequest.mock.calls[0];
    expect(JSON.parse(request.body)).toEqual({ kind: 'plan', planCode: 'PRO' });
    expect(request.idempotencyKey).toBe('subscription-test-idempotency-key');

    expect(result.ok).toBe(false);
    expect(result.status).toBe('payment_unavailable');
    expect(result.paymentId).toBeNull();
    expect(result.redirectUrl).toBeNull();
    expect(result.amount).toBeUndefined();
    expect(result.errorCode).toBe('PAYMENT_PROVIDER_NOT_CONFIGURED');
  });
});
