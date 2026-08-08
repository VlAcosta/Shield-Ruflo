import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getAccountScope, readScopedJson, writeScopedJson } from '../core/dataScope';
const ACCOUNT_ENDPOINT = getRuntimeEnv('ACCOUNT_ENDPOINT');
const ACCOUNT_CACHE_KEY = 'business-shield:account:center:v1';
const ACCOUNT_CHANGED_EVENT = 'business-shield:account-center-changed';

const DEFAULT_STATE = Object.freeze({
  version: 1,
  verifiedContacts: {
    email: true,
    phone: true,
  },
  contactChangedAt: {
    email: '',
    phone: '',
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readCache() {
  const parsed = readScopedJson(ACCOUNT_CACHE_KEY, { scope: getAccountScope(), legacy: true, fallback: null });
  return {
    ...clone(DEFAULT_STATE),
    ...(parsed || {}),
    verifiedContacts: {
      ...clone(DEFAULT_STATE.verifiedContacts),
      ...(parsed?.verifiedContacts || {}),
    },
    contactChangedAt: {
      ...clone(DEFAULT_STATE.contactChangedAt),
      ...(parsed?.contactChangedAt || {}),
    },
  };
}

function writeCache(next) {
  if (typeof window === 'undefined') return next;
  writeScopedJson(ACCOUNT_CACHE_KEY, next, { scope: getAccountScope() });
  window.dispatchEvent(new CustomEvent(ACCOUNT_CHANGED_EVENT, { detail: clone(next) }));
  return next;
}

async function request(path = '', options = {}) {
  if (!ACCOUNT_ENDPOINT) return null;
  return apiRequest(joinEndpoint(ACCOUNT_ENDPOINT, path), { ...options, timeout: 9000 });
}

export function getAccountCenterState() {
  return readCache();
}

export async function requestContactChange({ type, value }) {
  const remote = await request(`/contacts/${type}/request`, {
    method: 'POST',
    body: JSON.stringify({ value }),
  });

  if (remote) return remote;

  return {
    challengeId: `demo-${type}-${Date.now()}`,
    demo: true,
    code: '1111',
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  };
}

export async function verifyContactChange({ type, value, code, challengeId }) {
  const remote = await request(`/contacts/${type}/verify`, {
    method: 'POST',
    body: JSON.stringify({ value, code, challengeId }),
  });

  if (!remote) {
    if (String(code) !== '1111') {
      const error = new Error('Неверный код подтверждения');
      error.code = 'INVALID_CODE';
      throw error;
    }
  }

  const current = readCache();
  const next = {
    ...current,
    verifiedContacts: {
      ...current.verifiedContacts,
      [type]: true,
    },
    contactChangedAt: {
      ...current.contactChangedAt,
      [type]: new Date().toISOString(),
    },
  };
  writeCache(next);

  return remote || { verified: true, state: next };
}

export function markContactUnverified(type) {
  const current = readCache();
  return writeCache({
    ...current,
    verifiedContacts: {
      ...current.verifiedContacts,
      [type]: false,
    },
  });
}

export { ACCOUNT_CHANGED_EVENT };
