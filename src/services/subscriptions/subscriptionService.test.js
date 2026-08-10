import { createSubscriptionCheckout } from './subscriptionService';

describe('frontend-only subscription checkout', () => {
  test('does not fake a successful payment when backend is unavailable', async () => {
    const result = await createSubscriptionCheckout({ total: 1980 });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('payment_unavailable');
    expect(result.paymentId).toBeNull();
    expect(result.redirectUrl).toBeNull();
    expect(result.amount).toBe(1980);
  });
});
