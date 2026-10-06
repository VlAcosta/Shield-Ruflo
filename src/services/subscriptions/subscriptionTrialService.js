import { apiRequest } from '../core/apiClient';
import { normalizeSubscriptionSnapshot } from './subscriptionService';

export async function startProTrial() {
  const snapshot = await apiRequest('/api/v1/billing/subscription/trial', {
    method: 'POST',
    timeout: 10000,
  });
  return normalizeSubscriptionSnapshot(snapshot);
}
