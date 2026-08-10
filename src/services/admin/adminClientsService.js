import { apiRequest, joinEndpoint } from '../core/apiClient';

const ADMIN_CLIENTS_ENDPOINT = '/api/v1/admin/clients';

async function request(path = '', options = {}) {
  return apiRequest(joinEndpoint(ADMIN_CLIENTS_ENDPOINT, path), {
    ...options,
    timeout: 10000,
  });
}

export async function getAdminClients({ signal } = {}) {
  const data = await request('', { signal });
  const clients = Array.isArray(data) ? data : data?.clients;
  if (!Array.isArray(clients)) throw new Error('Сервер вернул некорректный список клиентов');
  return { clients, source: 'api' };
}

export async function getAdminClientDetails(clientId, { signal } = {}) {
  const data = await request(`/${clientId}`, { signal });
  if (!data?.client) throw new Error('Сервер не вернул карточку клиента');
  return { ...data, source: 'api' };
}

export async function createAdminClient(payload) {
  return request('', { method: 'POST', body: payload });
}

export async function updateAdminClient(clientId, patch) {
  const data = await request(`/${clientId}`, { method: 'PATCH', body: patch });
  return data?.client || data;
}

export function resetAdminClientsCache() {
  // Production admin data is server-authoritative; there is no local cache to reset.
}
