import { apiRequest, joinEndpoint } from '../core/apiClient';

const ADMIN_TICKETS_ENDPOINT = '/api/v1/admin/tickets';

async function request(path = '', options = {}) {
  return apiRequest(joinEndpoint(ADMIN_TICKETS_ENDPOINT, path), {
    ...options,
    timeout: 10000,
  });
}

export async function getAdminTickets({ signal } = {}) {
  const payload = await request('', { signal });
  const tickets = Array.isArray(payload) ? payload : payload?.tickets;
  if (!Array.isArray(tickets)) throw new Error('Сервер вернул некорректный список тикетов');
  return { tickets, configured: payload?.configured !== false, source: 'api' };
}

export async function updateAdminTicket(ticketId, patch) {
  const payload = await request(`/${ticketId}`, { method: 'PATCH', body: patch });
  return payload?.ticket || payload;
}

export async function addAdminTicketMessage(ticketId, message) {
  const text = String(message || '').trim();
  if (!text) throw new Error('Сообщение пустое');
  const payload = await request(`/${ticketId}/messages`, { method: 'POST', body: { text } });
  return payload?.ticket || payload;
}

export function resetAdminTicketsCache() {
  // Support tickets are server-authoritative.
}
