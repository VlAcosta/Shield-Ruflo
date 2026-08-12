import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
const ENDPOINT = String(getRuntimeEnv('CALENDAR_ENDPOINT')).replace(/\/$/, '');
const CACHE_KEY = 'business-shield:dashboard-calendar:v3';
export const CALENDAR_CHANGED_EVENT = 'business-shield:calendar-changed';

function readCache() {
  const parsed = readScopedJson(CACHE_KEY, { scope: getCompanyScope(), legacy: true, fallback: [] });
  return Array.isArray(parsed) ? parsed : [];
}

function writeCache(events) {
  writeScopedJson(CACHE_KEY, events, { scope: getCompanyScope() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(CALENDAR_CHANGED_EVENT, { detail: { events } }));
  return events;
}

async function request(path = '', options = {}) {
  if (!ENDPOINT) return null;
  return apiRequest(joinEndpoint(ENDPOINT, path), {
    ...options,
    body: options.body && typeof options.body === 'string' ? options.body : options.body,
    timeout: 8000,
  });
}

function requireServerEndpoint() {
  if (!ENDPOINT) {
    throw new Error('Календарь требует подключения к серверу. Локальные изменения отключены, чтобы не потерять данные команды.');
  }
}

export async function getCalendarEvents() {
  if (!ENDPOINT) return { events: readCache(), source: 'local' };
  try {
    const payload = await request();
    const events = Array.isArray(payload) ? payload : Array.isArray(payload?.items) ? payload.items : [];
    writeCache(events);
    return { events, source: 'api' };
  } catch (error) {
    const cached = readCache();
    if (cached.length) return { events: cached, source: 'cache', error };
    throw error;
  }
}

export async function createCalendarEvent(payload, currentEvents = []) {
  requireServerEndpoint();
  const remote = await request('', {
    method: 'POST',
    body: payload,
    idempotencyKey: createIdempotencyKey('calendar-create'),
  });
  if (!remote) throw new Error('Сервер календаря не вернул созданное событие');

  const event = remote.event || remote;
  const next = [event, ...currentEvents.filter((item) => item.id !== event.id)];
  writeCache(next);
  return { event, events: next, source: 'api' };
}

export async function deleteCalendarEvent(eventId, currentEvents = []) {
  requireServerEndpoint();
  await request(`/${encodeURIComponent(eventId)}`, { method: 'DELETE' });
  const next = currentEvents.filter((item) => item.id !== eventId);
  writeCache(next);
  return next;
}
