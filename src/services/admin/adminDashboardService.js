import { apiRequest } from '../core/apiClient';

const ADMIN_DASHBOARD_ENDPOINT = '/api/v1/admin/dashboard';

export async function getAdminDashboard({ signal } = {}) {
  const payload = await apiRequest(ADMIN_DASHBOARD_ENDPOINT, {
    signal,
    timeout: 10000,
  });

  if (!payload || !Array.isArray(payload.metrics)) {
    throw new Error('Сервер вернул некорректный admin dashboard snapshot');
  }

  return { ...payload, source: 'api' };
}
