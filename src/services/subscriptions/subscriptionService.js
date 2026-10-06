import { getRuntimeEnv } from '../core/runtimeEnv';
import {
  DEFAULT_CART,
  DEFAULT_SUBSCRIPTION_SNAPSHOT,
  PROMO_CODES,
} from '../../features/subscriptions/model/subscriptionData';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { isDemoDataEnabled } from '../core/runtimeConfig';

const ENDPOINT = String(getRuntimeEnv('SUBSCRIPTIONS_ENDPOINT')).replace(/\/$/, '');
const LOCAL_STATE_KEY = 'business_shield_subscription_state_v1';
export const SUBSCRIPTION_CHANGED_EVENT = 'business-shield:subscription-changed';

function delay(ms = 180) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function createEmptySubscriptionSnapshot() {
  return {
    plan: { id: '', name: '', price: 0, billingLabel: 'месяц', activeUntil: '', autoRenew: false },
    limits: [],
    packages: [],
    payments: [],
  };
}

function baseSubscriptionSnapshot() {
  return isDemoDataEnabled() ? DEFAULT_SUBSCRIPTION_SNAPSHOT : createEmptySubscriptionSnapshot();
}

function baseCart() {
  return isDemoDataEnabled() ? DEFAULT_CART : {};
}

function safeReadLocal() {
  return readScopedJson(LOCAL_STATE_KEY, { scope: getCompanyScope(), legacy: true, fallback: null });
}

function safeWriteLocal(value, { emit = true } = {}) {
  writeScopedJson(LOCAL_STATE_KEY, value, { scope: getCompanyScope() });
  if (emit && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SUBSCRIPTION_CHANGED_EVENT, { detail: value }));
}

const USAGE_META = Object.freeze({
  locations: { label: 'Точки', tone: 'violet' },
  review_sources: { label: 'Источники отзывов', tone: 'purple' },
  reviews: { label: 'Отзывы за месяц', tone: 'green' },
  users: { label: 'Пользователи', tone: 'orange' },
  ai_actions: { label: 'Действия ИИ за месяц', tone: 'violet' },
  automation_rules: { label: 'Активные автоматизации', tone: 'purple' },
  competitors: { label: 'Конкуренты', tone: 'green' },
});

export function normalizeSubscriptionSnapshot(value = {}) {
  const base = baseSubscriptionSnapshot();
  const usageMeters = Array.isArray(value?.usage?.meters) ? value.usage.meters : null;
  const limits = usageMeters
    ? usageMeters.map((meter) => {
      const meta = USAGE_META[meter.key] || { label: meter.key, tone: 'violet' };
      const limit = Number.isFinite(Number(meter.limit)) ? Number(meter.limit) : null;
      return {
        id: meter.key,
        key: meter.key,
        label: meta.label,
        tone: meta.tone,
        used: Number(meter.used) || 0,
        total: limit,
        state: meter.state || (limit === null ? 'unmetered' : 'ok'),
        percentage: Number.isFinite(Number(meter.percentage)) ? Number(meter.percentage) : null,
      };
    })
    : (Array.isArray(value?.limits) ? value.limits : base.limits);

  return {
    ...base,
    ...value,
    plan: {
      ...base.plan,
      ...(value?.plan || {}),
    },
    limits,
    packages: Array.isArray(value?.packages) ? value.packages : base.packages,
    payments: Array.isArray(value?.payments) ? value.payments : base.payments,
  };
}

function mergeSnapshot(localState) {
  return normalizeSubscriptionSnapshot(localState?.snapshot || {});
}

async function request(path = '', options = {}) {
  if (!ENDPOINT) return null;
  return apiRequest(joinEndpoint(ENDPOINT, path), { ...options, timeout: 10000 });
}

function paymentUnavailable(payload, error = null) {
  return {
    ok: false,
    status: 'payment_unavailable',
    paymentId: null,
    amount: Number(payload?.total || 0),
    redirectUrl: null,
    message: error?.message || 'Онлайн-оплата сейчас недоступна',
    errorCode: error?.code || 'PAYMENT_PROVIDER_NOT_CONFIGURED',
  };
}

export async function getSubscriptionSnapshot({ signal } = {}) {
  if (ENDPOINT) {
    try {
      const data = await request('', { signal });
      const snapshot = normalizeSubscriptionSnapshot(data);
      const cachedState = { snapshot, cart: { ...baseCart(), ...(safeReadLocal()?.cart || {}) } };
      safeWriteLocal(cachedState, { emit: false });
      return {
        snapshot,
        cart: cachedState.cart,
        source: 'api',
        stale: false,
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      const localState = safeReadLocal();
      if (localState) {
        return {
          snapshot: mergeSnapshot(localState),
          cart: { ...baseCart(), ...(localState?.cart || {}) },
          source: 'cache',
          stale: true,
          error,
        };
      }
      throw error;
    }
  }

  const localState = safeReadLocal();

  return {
    snapshot: mergeSnapshot(localState),
    cart: {
      ...baseCart(),
      ...(localState?.cart || {}),
    },
    source: 'local',
    stale: true,
  };
}

export async function setSubscriptionAutoRenew(enabled, currentState) {
  if (ENDPOINT) {
    const result = await request('/auto-renew', { method: 'PATCH', body: JSON.stringify({ enabled }) });
    const previous = safeReadLocal() || currentState || {};
    const nextSnapshot = result?.snapshot || (result?.plan ? { ...(previous.snapshot || {}), plan: result.plan } : previous.snapshot);
    if (nextSnapshot) safeWriteLocal({ ...previous, snapshot: nextSnapshot });
    else if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SUBSCRIPTION_CHANGED_EVENT, { detail: result }));
    return result;
  }

  await delay(120);
  const nextState = {
    ...(safeReadLocal() || {}),
    ...currentState,
    snapshot: {
      ...currentState.snapshot,
      plan: {
        ...currentState.snapshot.plan,
        autoRenew: enabled,
      },
    },
  };
  safeWriteLocal(nextState);
  return nextState.snapshot.plan;
}

export async function persistSubscriptionCart(cart, currentState) {
  if (ENDPOINT) return { cart };

  const nextState = {
    ...(safeReadLocal() || {}),
    ...currentState,
    cart,
  };
  safeWriteLocal(nextState);
  return nextState;
}

export async function validatePromoCode(code, subtotal) {
  const normalized = String(code || '').trim().toUpperCase();

  if (ENDPOINT) {
    return request('/promo/validate', {
      method: 'POST',
      body: JSON.stringify({ code: normalized, subtotal }),
    });
  }

  await delay(260);
  const percent = PROMO_CODES[normalized] || 0;

  if (!percent) {
    return {
      valid: false,
      code: normalized,
      percent: 0,
      discount: 0,
    };
  }

  return {
    valid: true,
    code: normalized,
    percent,
    discount: Math.round((Number(subtotal) || 0) * (percent / 100)),
  };
}

export async function createSubscriptionCheckout(payload) {
  if (ENDPOINT) {
    try {
      const result = await request('/checkout', {
        method: 'POST',
        body: JSON.stringify(payload),
        idempotencyKey: createIdempotencyKey('subscription-checkout'),
      });
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SUBSCRIPTION_CHANGED_EVENT, { detail: result }));
      return result;
    } catch (error) {
      return paymentUnavailable(payload, error);
    }
  }

  await delay(120);
  return paymentUnavailable(payload);
}

export async function downloadPaymentReceipt(payment) {
  if (ENDPOINT) {
    const blob = await apiRequest(joinEndpoint(ENDPOINT, `/payments/${encodeURIComponent(payment.id)}/receipt`), { responseType: 'blob', timeout: 15000 });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `receipt-${payment.id}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    return;
  }

  const receipt = [
    'БИЗНЕС ЩИТ',
    'Квитанция',
    '',
    `Дата: ${payment.date}`,
    `Описание: ${payment.title}`,
    `Сумма: ${Number(payment.amount).toLocaleString('ru-RU')} ₽`,
    `Статус: ${payment.status === 'refund' ? 'Возврат' : 'Оплачено'}`,
    `ID: ${payment.id}`,
  ].join('\n');

  const blob = new Blob([receipt], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `receipt-${payment.id}.txt`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
