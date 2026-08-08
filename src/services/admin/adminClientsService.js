import { DEFAULT_ADMIN_CLIENTS } from '../../features/admin/clients/model/adminClientsData';

const CACHE_KEY = 'business-shield:admin-clients:v1';
const endpoint = process.env.REACT_APP_ADMIN_CLIENTS_ENDPOINT || '';

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return Array.isArray(parsed) && parsed.length ? parsed : DEFAULT_ADMIN_CLIENTS.map((item) => ({ ...item }));
  } catch {
    return DEFAULT_ADMIN_CLIENTS.map((item) => ({ ...item }));
  }
}

function writeCache(clients) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(clients));
  return clients;
}

async function request(path = '', options) {
  const response = await fetch(`${endpoint}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`Admin clients API: ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

export async function getAdminClients() {
  if (!endpoint) return { clients: readCache(), source: 'cache' };
  const data = await request();
  const clients = Array.isArray(data) ? data : data.clients;
  if (!Array.isArray(clients)) throw new Error('Некорректный ответ API клиентов');
  writeCache(clients);
  return { clients, source: 'api' };
}

export async function createAdminClient(payload) {
  if (endpoint) return request('', { method: 'POST', body: JSON.stringify(payload) });
  const clients = readCache();
  const created = { ...payload, id: payload.id || `client-${Date.now()}` };
  writeCache([created, ...clients]);
  return created;
}

export async function updateAdminClient(clientId, patch) {
  if (endpoint) return request(`/${clientId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  const clients = readCache();
  const next = clients.map((client) => client.id === clientId ? { ...client, ...patch } : client);
  writeCache(next);
  return next.find((client) => client.id === clientId) || null;
}

export function resetAdminClientsCache() {
  localStorage.removeItem(CACHE_KEY);
}
