import { apiRequest, joinEndpoint } from '../core/apiClient';

const ADMIN_SUBSCRIPTIONS_ENDPOINT = '/api/v1/admin/subscriptions';
export const SUBSCRIPTIONS_CHANGED_EVENT = 'business-shield:admin-subscriptions-changed';

function emit(snapshot) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SUBSCRIPTIONS_CHANGED_EVENT, { detail: snapshot }));
  }
}

async function request(path = '', options = {}) {
  return apiRequest(joinEndpoint(ADMIN_SUBSCRIPTIONS_ENDPOINT, path), {
    ...options,
    timeout: 10000,
  });
}

export async function getAdminSubscriptions({ signal } = {}) {
  const payload = await request('', { signal });
  if (!payload || !Array.isArray(payload.plans) || !Array.isArray(payload.subscriptions)) {
    throw new Error('Сервер вернул некорректный snapshot подписок');
  }
  return { ...payload, source: 'api' };
}

export async function createAdminPlan(payload) {
  const body = {
    code: String(payload?.code || '').trim(),
    name: String(payload?.name || '').trim(),
    price: Number(payload?.price || 0),
    currency: String(payload?.currency || 'RUB').trim().toUpperCase(),
  };
  const result = await request('/plans', { method: 'POST', body });
  const snapshot = await getAdminSubscriptions();
  emit(snapshot);
  return result?.plan || result;
}

export async function updateAdminPlan(planId, patch) {
  const body = {};
  if (patch?.name !== undefined) body.name = String(patch.name).trim();
  if (patch?.price !== undefined) body.price = Number(patch.price || 0);
  if (patch?.active !== undefined) body.active = Boolean(patch.active);

  if (!Object.keys(body).length) {
    throw new Error('Нет поддерживаемых изменений тарифа');
  }

  const result = await request(`/plans/${encodeURIComponent(planId)}`, { method: 'PATCH', body });
  const snapshot = await getAdminSubscriptions();
  emit(snapshot);
  return result?.plan || result;
}

export async function updateClientSubscription(clientId, patch) {
  const allowed = {};
  if (patch?.autoRenew !== undefined) allowed.autoRenew = Boolean(patch.autoRenew);
  if (!Object.keys(allowed).length) {
    throw new Error('В production admin API разрешено изменять только автопродление без имитации платежа');
  }
  const result = await request(`/clients/${clientId}`, { method: 'PATCH', body: allowed });
  const snapshot = await getAdminSubscriptions();
  emit(snapshot);
  return result?.subscription || result;
}

export function resetAdminSubscriptionsCache() {
  // Billing and subscription data is server-authoritative.
}
