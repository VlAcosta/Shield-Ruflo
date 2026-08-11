import { apiRequest } from '../core/apiClient';

export async function startProTrial() {
  return apiRequest('/api/v1/billing/subscription/trial', {
    method: 'POST',
    timeout: 10000,
  });
}
