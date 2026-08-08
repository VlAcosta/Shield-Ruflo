import { DEFAULT_ADMIN_TICKETS } from '../../features/admin/tickets/model/adminTicketsData';

const CACHE_KEY = 'business-shield:admin-tickets:v1';
const endpoint = process.env.REACT_APP_ADMIN_TICKETS_ENDPOINT || '';

function cloneFallback() {
  return DEFAULT_ADMIN_TICKETS.map((ticket) => ({
    ...ticket,
    messages: ticket.messages.map((message) => ({ ...message })),
    activity: ticket.activity.map((item) => ({ ...item })),
  }));
}

function readCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return Array.isArray(parsed) && parsed.length ? parsed : cloneFallback();
  } catch {
    return cloneFallback();
  }
}

function writeCache(tickets) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(tickets));
  window.dispatchEvent(new CustomEvent('business-shield:admin-tickets-changed', { detail: { tickets } }));
  return tickets;
}

async function request(path = '', options) {
  const response = await fetch(`${endpoint}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`Admin tickets API: ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

export async function getAdminTickets() {
  if (!endpoint) return { tickets: readCache(), source: 'cache' };
  const data = await request();
  const tickets = Array.isArray(data) ? data : data.tickets;
  if (!Array.isArray(tickets)) throw new Error('Некорректный ответ API тикетов');
  writeCache(tickets);
  return { tickets, source: 'api' };
}

export async function updateAdminTicket(ticketId, patch) {
  if (endpoint) return request(`/${ticketId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  const tickets = readCache();
  const now = new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).replace(',', '');
  const statusLabels = { open: 'Открыт', in_progress: 'В обработке', waiting: 'Ждём клиента', closed: 'Закрыт' };
  const next = tickets.map((ticket) => {
    if (ticket.id !== ticketId) return ticket;
    const activity = [...(ticket.activity || [])];
    if (patch.status && patch.status !== ticket.status) activity.push({ id: `activity-${Date.now()}-status`, label: `Статус изменён на «${statusLabels[patch.status] || patch.status}»`, at: now });
    if (patch.assignedManagerName && patch.assignedManagerName !== ticket.assignedManagerName) activity.push({ id: `activity-${Date.now()}-manager`, label: `Назначен ${patch.assignedManagerName}`, at: now });
    return { ...ticket, ...patch, updatedAt: patch.updatedAt || now, activity };
  });
  writeCache(next);
  return next.find((ticket) => ticket.id === ticketId) || null;
}

export async function addAdminTicketMessage(ticketId, payload) {
  if (endpoint) return request(`/${ticketId}/messages`, { method: 'POST', body: JSON.stringify(payload) });
  const tickets = readCache();
  let created = null;
  const next = tickets.map((ticket) => {
    if (ticket.id !== ticketId) return ticket;
    created = {
      id: `${ticketId}-${Date.now()}`,
      author: payload.author || 'Admin',
      role: payload.role || 'agent',
      text: payload.text,
      createdAt: payload.createdAt || new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).replace(',', ''),
      internal: Boolean(payload.internal),
    };
    return {
      ...ticket,
      status: payload.internal ? ticket.status : (ticket.status === 'closed' ? 'open' : ticket.status),
      updatedAt: created.createdAt,
      unread: 0,
      messages: [...ticket.messages, created],
      activity: [...ticket.activity, { id: `activity-${Date.now()}`, label: payload.internal ? 'Добавлена внутренняя заметка' : 'Отправлен ответ клиенту', at: created.createdAt }],
    };
  });
  writeCache(next);
  return created;
}

export function resetAdminTicketsCache() {
  localStorage.removeItem(CACHE_KEY);
}
