import { getRuntimeEnv } from '../core/runtimeEnv';
import {
  DEFAULT_SUPPORT_THREADS,
  SUPPORT_CHANNELS,
} from '../../features/support/model/supportData';
import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { isDemoDataEnabled } from '../core/runtimeConfig';

const SUPPORT_ENDPOINT = getRuntimeEnv('SUPPORT_ENDPOINT');
const CACHE_KEY = 'business-shield:support:snapshot:v1';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultSnapshot() {
  return {
    version: 1,
    activeChannel: 'manager',
    channels: clone(SUPPORT_CHANNELS),
    threads: isDemoDataEnabled() ? clone(DEFAULT_SUPPORT_THREADS) : { manager: [], technical: [] },
  };
}

function readCache() {
  return readScopedJson(CACHE_KEY, { scope: getCompanyScope(), legacy: true, fallback: null });
}

function writeCache(snapshot) {
  if (typeof window === 'undefined') return;
  writeScopedJson(CACHE_KEY, snapshot, { scope: getCompanyScope() });
}

async function request(path = '', options = {}) {
  if (!SUPPORT_ENDPOINT) return null;
  return apiRequest(joinEndpoint(SUPPORT_ENDPOINT, path), { ...options, timeout: 10000 });
}

function normalizeSnapshot(snapshot) {
  const fallback = createDefaultSnapshot();
  if (!snapshot) return fallback;

  return {
    ...fallback,
    ...snapshot,
    channels: Array.isArray(snapshot.channels) ? snapshot.channels : fallback.channels,
    threads: {
      ...fallback.threads,
      ...(snapshot.threads || {}),
    },
  };
}

export async function getSupportSnapshot({ signal } = {}) {
  let remote = null;
  try { remote = await request('', { signal }); } catch (error) {
    if (error?.name === 'AbortError') throw error;
    if (!readCache()) throw error;
  }
  const snapshot = normalizeSnapshot(remote?.snapshot || remote || readCache());
  writeCache(snapshot);
  return snapshot;
}

export async function saveSupportPreference(activeChannel, snapshot) {
  const remote = await request('/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ activeChannel }),
  });

  if (remote) {
    const next = normalizeSnapshot(remote.snapshot || remote);
    writeCache(next);
    return { snapshot: next };
  }

  const next = { ...snapshot, activeChannel };
  writeCache(next);
  return { snapshot: next };
}

export async function sendSupportMessage(channelId, message, snapshot) {
  const payload = {
    text: message.text,
    attachments: message.attachments || [],
  };

  const remote = await request(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
    idempotencyKey: `support-message-${message.id || Date.now()}`,
  });

  if (remote) {
    const next = normalizeSnapshot(remote.snapshot || remote);
    writeCache(next);
    return { snapshot: next };
  }

  const currentThread = snapshot.threads[channelId] || [];
  const alreadyPresent = currentThread.some((item) => item.id === message.id);
  const next = {
    ...snapshot,
    threads: {
      ...snapshot.threads,
      [channelId]: alreadyPresent ? currentThread : [...currentThread, message],
    },
  };

  writeCache(next);
  return { snapshot: next };
}
