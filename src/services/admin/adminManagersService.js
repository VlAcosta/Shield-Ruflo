import { apiRequest, joinEndpoint } from '../core/apiClient';

const ADMIN_MANAGERS_ENDPOINT = '/api/v1/admin/managers';

async function request(path = '', options = {}) {
  return apiRequest(joinEndpoint(ADMIN_MANAGERS_ENDPOINT, path), {
    ...options,
    timeout: 10000,
  });
}

export async function getAdminManagers({ signal } = {}) {
  const payload = await request('', { signal });
  const managers = Array.isArray(payload) ? payload : payload?.managers;
  if (!Array.isArray(managers)) throw new Error('Сервер вернул некорректный список менеджеров');
  return { managers, configured: payload?.configured !== false, source: 'api' };
}

export async function createAdminManager(payload) {
  return request('', { method: 'POST', body: payload });
}

export async function updateAdminManager(managerId, patch) {
  const payload = await request(`/${managerId}`, { method: 'PATCH', body: patch });
  return payload?.manager || payload;
}

export async function getAdminManager(managerId, options = {}) {
  const { managers } = await getAdminManagers(options);
  return managers.find((manager) => manager.id === managerId) || null;
}

export function resetAdminManagersCache() {
  // Platform-manager data is server-authoritative.
}
