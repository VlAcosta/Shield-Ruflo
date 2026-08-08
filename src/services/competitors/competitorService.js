import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';

const ENDPOINT = String(getRuntimeEnv('COMPETITORS_ENDPOINT')).replace(/\/$/, '');
const CACHE_KEY = 'business-shield:competitors:v1';
export const COMPETITORS_CHANGED_EVENT = 'business-shield:competitors-changed';

function normalize(item) {
  if (!item?.id && !item?.name) return null;
  return {
    id: String(item.id || `competitor-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    name: String(item.name || 'Конкурент').trim(),
    platform: String(item.platform || 'yandex'),
    url: String(item.url || '').trim(),
    rating: Number.isFinite(Number(item.rating)) ? Number(item.rating) : null,
    reviews: Number.isFinite(Number(item.reviews)) ? Math.max(0, Number(item.reviews)) : null,
    negativeShare: Number.isFinite(Number(item.negativeShare)) ? Math.min(100, Math.max(0, Number(item.negativeShare))) : null,
    responseCoverage: Number.isFinite(Number(item.responseCoverage)) ? Math.min(100, Math.max(0, Number(item.responseCoverage))) : null,
    updatedAt: item.updatedAt || new Date().toISOString(),
    source: item.source || (ENDPOINT ? 'api' : 'manual'),
  };
}

function readCache() {
  const value = readScopedJson(CACHE_KEY, { scope: getCompanyScope(), legacy: true, fallback: [] });
  return Array.isArray(value) ? value.map(normalize).filter(Boolean) : [];
}

function writeCache(items, { emit = true } = {}) {
  const normalized = items.map(normalize).filter(Boolean);
  writeScopedJson(CACHE_KEY, normalized, { scope: getCompanyScope() });
  if (emit && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(COMPETITORS_CHANGED_EVENT, { detail: { competitors: normalized } }));
  return normalized;
}

async function request(path = '', options = {}) {
  if (!ENDPOINT) return null;
  return apiRequest(joinEndpoint(ENDPOINT, path), { ...options, timeout: 9000 });
}

export async function getCompetitors() {
  try {
    const remote = await request();
    if (remote) {
      const items = Array.isArray(remote) ? remote : remote.items || remote.competitors || [];
      const normalized = writeCache(items, { emit: false });
      return { items: normalized, source: 'api' };
    }
  } catch (error) {
    const cached = readCache();
    if (cached.length) return { items: cached, source: 'cache', error };
    throw error;
  }
  return { items: readCache(), source: 'local' };
}

export async function createCompetitor(payload, current = []) {
  const remote = await request('', { method: 'POST', body: payload, idempotencyKey: createIdempotencyKey('competitor-create') });
  const item = normalize(remote?.competitor || remote || { ...payload, id: `competitor-${Date.now()}` });
  const next = writeCache([item, ...current.filter((entry) => entry.id !== item.id)]);
  return { item, items: next, source: remote ? 'api' : 'local' };
}

export async function removeCompetitor(id, current = []) {
  await request(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
  return writeCache(current.filter((item) => item.id !== id));
}
