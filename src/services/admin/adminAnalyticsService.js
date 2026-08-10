import { apiRequest } from '../core/apiClient';

const ADMIN_ANALYTICS_ENDPOINT = '/api/v1/admin/analytics';

export async function getAdminAnalytics(period = 'month', { signal } = {}) {
  const query = new URLSearchParams({ period });
  const payload = await apiRequest(`${ADMIN_ANALYTICS_ENDPOINT}?${query.toString()}`, {
    signal,
    timeout: 10000,
  });

  if (!payload || !Array.isArray(payload.metrics) || !Array.isArray(payload.platforms)) {
    throw new Error('Сервер вернул некорректный admin analytics snapshot');
  }

  return { ...payload, source: 'api' };
}
