import { DEFAULT_ADMIN_PLANS, DEFAULT_BILLING_EVENTS, UPCOMING_RENEWAL_DATES } from '../../features/admin/subscriptions/model/adminSubscriptionsData';
import { getAdminClients, updateAdminClient } from './adminClientsService';

const PLAN_CACHE_KEY = 'business-shield:admin-plans:v2';
const EVENTS_CACHE_KEY = 'business-shield:admin-billing-events:v1';
const endpoint = process.env.REACT_APP_ADMIN_SUBSCRIPTIONS_ENDPOINT || '';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readPlans() {
  try {
    const cached = JSON.parse(localStorage.getItem(PLAN_CACHE_KEY) || 'null');
    return Array.isArray(cached) && cached.length ? cached : clone(DEFAULT_ADMIN_PLANS);
  } catch {
    return clone(DEFAULT_ADMIN_PLANS);
  }
}

function writePlans(plans) {
  localStorage.setItem(PLAN_CACHE_KEY, JSON.stringify(plans));
  window.dispatchEvent(new CustomEvent('business-shield:admin-plans-changed'));
  return plans;
}

function readEvents() {
  try {
    const cached = JSON.parse(localStorage.getItem(EVENTS_CACHE_KEY) || 'null');
    return Array.isArray(cached) && cached.length ? cached : clone(DEFAULT_BILLING_EVENTS);
  } catch {
    return clone(DEFAULT_BILLING_EVENTS);
  }
}

function writeEvents(events) {
  localStorage.setItem(EVENTS_CACHE_KEY, JSON.stringify(events));
  return events;
}

async function request(path = '', options) {
  const response = await fetch(`${endpoint}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(options?.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`Admin subscriptions API: ${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

function subscriptionStatus(client) {
  if (client.status === 'active') return 'active';
  if (client.status === 'trial') return 'trial';
  if (client.status === 'expired') return 'expired';
  return 'cancelled';
}

function buildSnapshot(clients, plans) {
  const planMap = Object.fromEntries(plans.map((plan) => [plan.id, plan]));
  const subscriptions = clients.map((client) => ({
    id: `subscription-${client.id}`,
    clientId: client.id,
    clientName: client.name,
    initials: client.initials,
    planId: client.planId,
    planName: planMap[client.planId]?.name || client.plan,
    status: subscriptionStatus(client),
    statusLabel: client.statusLabel,
    startDate: client.startDate,
    expiryDate: client.expiryDate,
    renewalDate: UPCOMING_RENEWAL_DATES[client.id] || client.expiryDate,
    revenue: Number(client.revenue || 0),
    autoRenew: Boolean(client.autoRenew),
    managerName: client.managerName,
    rating: client.rating,
  }));

  const active = subscriptions.filter((item) => item.status === 'active');
  const mrr = active.reduce((sum, item) => sum + item.revenue, 0);
  const expiringSoon = subscriptions.filter((item) => item.status === 'active' || item.status === 'trial').slice(0, 6).length;
  const manualRenewals = subscriptions.filter((item) => !item.autoRenew && (item.status === 'active' || item.status === 'trial')).length;
  const atRisk = subscriptions.filter((item) => Number(item.rating || 5) < 3.5 || !item.autoRenew).length;

  return {
    plans: plans.map((plan) => ({
      ...plan,
      clients: subscriptions.filter((subscription) => subscription.planId === plan.id).length,
      activeClients: subscriptions.filter((subscription) => subscription.planId === plan.id && subscription.status === 'active').length,
      mrr: subscriptions.filter((subscription) => subscription.planId === plan.id && subscription.status === 'active').reduce((sum, subscription) => sum + subscription.revenue, 0),
    })),
    subscriptions,
    renewals: subscriptions
      .filter((item) => item.status === 'active' || item.status === 'trial')
      .sort((a, b) => {
        const key = (value) => {
          const [day, month, year] = String(value || '').split('.').map(Number);
          return (year || 0) * 10000 + (month || 0) * 100 + (day || 0);
        };
        return key(a.renewalDate) - key(b.renewalDate);
      })
      .slice(0, 12),
    events: readEvents(),
    metrics: {
      mrr,
      arr: mrr * 12,
      active: active.length,
      expiringSoon,
      manualRenewals,
      atRisk,
      renewalRate: 94,
    },
  };
}

export async function getAdminSubscriptions() {
  if (endpoint) {
    const data = await request();
    if (!data || !Array.isArray(data.plans) || !Array.isArray(data.subscriptions)) throw new Error('Некорректный ответ API подписок');
    return { ...data, source: 'api' };
  }
  const [{ clients }, plans] = await Promise.all([getAdminClients(), Promise.resolve(readPlans())]);
  return { ...buildSnapshot(clients, plans), source: 'cache' };
}

export async function updateAdminPlan(planId, patch) {
  if (endpoint) return request(`/plans/${planId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  const plans = readPlans();
  const next = plans.map((plan) => plan.id === planId ? { ...plan, ...patch } : plan);
  writePlans(next);
  return next.find((plan) => plan.id === planId) || null;
}

export async function createAdminPlan(payload) {
  if (endpoint) return request('/plans', { method: 'POST', body: JSON.stringify(payload) });
  const plans = readPlans();
  const created = { ...payload, id: payload.id || `plan-${Date.now()}` };
  writePlans([...plans, created]);
  return created;
}

export async function updateAdminSubscription(clientId, patch) {
  if (endpoint) return request(`/subscriptions/${clientId}`, { method: 'PATCH', body: JSON.stringify(patch) });
  const plans = readPlans();
  const plan = patch.planId ? plans.find((item) => item.id === patch.planId) : null;
  const clientPatch = { ...patch };
  if (plan) {
    clientPatch.plan = plan.name;
    if (patch.status === 'active' || !patch.status) clientPatch.revenue = plan.price;
  }
  return updateAdminClient(clientId, clientPatch);
}

export async function toggleAdminAutoRenew(clientId, autoRenew) {
  const updated = await updateAdminSubscription(clientId, { autoRenew });
  if (!endpoint) {
    const events = readEvents();
    writeEvents([
      {
        id: `renew-${Date.now()}`,
        type: autoRenew ? 'payment' : 'risk',
        title: autoRenew ? 'Автопродление включено' : 'Автопродление отключено',
        description: `Клиент ${clientId}`,
        time: 'только что',
        tone: autoRenew ? 'green' : 'orange',
      },
      ...events,
    ].slice(0, 10));
  }
  return updated;
}

export function resetAdminSubscriptionsCache() {
  localStorage.removeItem(PLAN_CACHE_KEY);
  localStorage.removeItem(EVENTS_CACHE_KEY);
}
