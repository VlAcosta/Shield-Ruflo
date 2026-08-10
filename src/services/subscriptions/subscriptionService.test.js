import { apiRequest } from '../core/apiClient';
import { createSubscriptionCheckout } from './subscriptionService';

jest.mock('../core/apiClient', () => {
  const actual = jest.requireActual('../core/apiClient');
  return {
    ...actual,
    apiRequest: jest.fn(),
    createIdempotencyKey: jest.fn(() => 'subscription-test-idempotency-key'),
  };
});

describe('subscription checkout provider truth', () => {
  beforeEach(() => {
    apiRequest.mockReset();
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
