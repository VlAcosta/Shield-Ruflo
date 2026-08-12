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
const BILLING_ENDPOINT = ENDPOINT.replace(/\/subscription$/, '');
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
    availablePlans: [],
    paymentProviderConfigured: false,
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

function mergeSnapshot(localState) {
  const base = baseSubscriptionSnapshot();
  return {
    ...base,
    ...(localState?.snapshot || {}),
    plan: {
      ...base.plan,
      ...(localState?.snapshot?.plan || {}),
    },
    limits: localState?.snapshot?.limits || base.limits,
    packages: localState?.snapshot?.packages || base.packages,
    payments: localState?.snapshot?.payments || base.payments,
    availablePlans: localState?.snapshot?.availablePlans || base.availablePlans || [],
  };
}

async function request(path = '', options = {}) {
  if (!ENDPOINT) return null;
  return apiRequest(joinEndpoint(ENDPOINT, path), { ...options, timeout: 10000 });
}

async function billingRequest(path = '', options = {}) {
  if (!BILLING_ENDPOINT) return null;
  return apiRequest(joinEndpoint(BILLING_ENDPOINT, path), { ...options, timeout: 10000 });
}

function paymentUnavailable(error = null) {
  return {
    ok: false,
    status: 'payment_unavailable',
    paymentId: null,
    redirectUrl: null,
    message: error?.message || 'Онлайн-оплата сейчас недоступна',
    errorCode: error?.code || 'PAYMENT_PROVIDER_NOT_CONFIGURED',
  };
}

export async function getSubscriptionSnapshot({ signal } = {}) {
  if (ENDPOINT) {
    try {
      const data = await request('', { signal });
      const cachedState = { snapshot: data, cart: { ...baseCart(), ...(safeReadLocal()?.cart || {}) } };
      safeWriteLocal(cachedState, { emit: false });
      return {
        snapshot: data,
        cart: cachedState.cart,
        source: 'api',
      };
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      const localState = safeReadLocal();
      if (localState) {
        return {
          snapshot: mergeSnapshot(localState),
          cart: { ...baseCart(), ...(localState?.cart || {}) },
          source: 'cache',
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
  };
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

export async function quoteSubscriptionConstructor(selection, { signal } = {}) {
  if (BILLING_ENDPOINT) {
    return billingRequest('/constructor/quote', {
      method: 'POST',
      body: JSON.stringify(selection),
      signal,
    });
  }

  if (isDemoDataEnabled()) {
    await delay(120);
    return null;
  }

  throw new Error('Серверный расчёт тарифа недоступен');
}

export async function createSubscriptionCheckout(payload, { idempotencyKey } = {}) {
  if (ENDPOINT) {
    try {
      const result = await request('/checkout', {
        method: 'POST',
        body: JSON.stringify(payload),
        idempotencyKey: idempotencyKey || createIdempotencyKey('subscription-checkout'),
      });
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SUBSCRIPTION_CHANGED_EVENT, { detail: result }));
      return result;
    } catch (error) {
      return paymentUnavailable(error);
    }
  }

  await delay(120);
  return paymentUnavailable();
}

export async function getSubscriptionPayment(paymentId, { refresh = false, signal } = {}) {
  if (!BILLING_ENDPOINT) return null;
  return billingRequest(`/payments/${encodeURIComponent(paymentId)}?refresh=${refresh ? 'true' : 'false'}`, { signal });
}

export async function downloadPaymentReceipt(payment) {
  if (ENDPOINT) {
    const blob = await apiRequest(joinEndpoint(BILLING_ENDPOINT, `/payments/${encodeURIComponent(payment.id)}/receipt`), { responseType: 'blob', timeout: 15000 });
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
