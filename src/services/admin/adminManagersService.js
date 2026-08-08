import { DEFAULT_ADMIN_MANAGERS } from '../../features/admin/managers/model/adminManagersData';

const CACHE_KEY = 'business-shield:admin-managers:v1';
const endpoint = process.env.REACT_APP_ADMIN_MANAGERS_ENDPOINT || '';

function cloneFallback() {
  return DEFAULT_ADMIN_MANAGERS.map((item) => ({ ...item, performance: [...item.performance] }));
}

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return Array.isArray(parsed) && parsed.length ? parsed : cloneFallback();
  } catch {
    return cloneFallback();
  }
}

function writeCache(managers) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(managers));
  return managers;
}

async function request(path = '', options) {
  const response = await fetch(`${endpoint}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`Admin managers API: ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

export async function getAdminManagers() {
  if (!endpoint) return { managers: readCache(), source: 'cache' };
  const data = await request();
  const managers = Array.isArray(data) ? data : data.managers;
  if (!Array.isArray(managers)) throw new Error('Некорректный ответ API менеджеров');
  writeCache(managers);
  return { managers, source: 'api' };
}

export async function createAdminManager(payload) {
  if (endpoint) return request('', { method: 'POST', body: JSON.stringify(payload) });
  const managers = readCache();
  const created = { ...payload, id: payload.id || `manager-${Date.now()}` };
  writeCache([...managers, created]);
  return created;
}

export async function updateAdminManager(managerId, patch) {
  if (endpoint) return request(`/${managerId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  const managers = readCache();
  const next = managers.map((manager) => manager.id === managerId ? { ...manager, ...patch } : manager);
  writeCache(next);
  return next.find((manager) => manager.id === managerId) || null;
}

export function resetAdminManagersCache() {
  localStorage.removeItem(CACHE_KEY);
}
