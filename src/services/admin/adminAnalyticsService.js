import { DEFAULT_ADMIN_ANALYTICS } from '../../features/admin/analytics/model/adminAnalyticsData';

const endpoint = process.env.REACT_APP_ADMIN_ANALYTICS_ENDPOINT || '';

async function request(path = '') {
  const response = await fetch(`${endpoint}${path}`, { credentials:'include' });
  if (!response.ok) throw new Error(`Admin analytics API: ${response.status}`);
  return response.json();
}

export async function getAdminAnalytics(period = 'month') {
  if (!endpoint) return { ...JSON.parse(JSON.stringify(DEFAULT_ADMIN_ANALYTICS)), period, source:'mock' };
  const data = await request(`?period=${encodeURIComponent(period)}`);
  if (!data || !Array.isArray(data.metrics)) throw new Error('Некорректный ответ API аналитики');
  return { ...data, period, source:'api' };
}
