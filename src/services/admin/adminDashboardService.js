import { ADMIN_DASHBOARD_FALLBACK } from '../../features/admin/dashboard/model/adminDashboardData';

const ENDPOINT = process.env.REACT_APP_ADMIN_DASHBOARD_ENDPOINT || '';

export async function getAdminDashboard() {
  if (!ENDPOINT) return ADMIN_DASHBOARD_FALLBACK;

  const response = await fetch(ENDPOINT, { credentials: 'include', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Admin dashboard request failed: ${response.status}`);
  return response.json();
}
