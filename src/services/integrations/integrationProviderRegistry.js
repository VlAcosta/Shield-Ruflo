import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { getRuntimeEnv } from '../core/runtimeEnv';

export const INTEGRATION_PROVIDER_ENDPOINT = getRuntimeEnv('INTEGRATIONS_ENDPOINT', '');
const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

const BACKEND_PROVIDER_IDS = Object.freeze({
  google: 'google-business-profile',
  gis: '2gis',
});
const CLIENT_PROVIDER_IDS = Object.freeze({
  'google-business-profile': 'google',
  '2gis': 'gis',
});

export const PROVIDER_TRUTH_CHANGED_EVENT = 'business-shield:provider-truth-changed';

let providerTruthCache = new Map();

export function getBackendProviderId(providerId) {
  return BACKEND_PROVIDER_IDS[providerId] || providerId;
}

function getClientProviderId(providerId) {
  return CLIENT_PROVIDER_IDS[providerId] || providerId;
}

function providerPath(providerId, action = '') {
  const path = `/providers/${encodeURIComponent(getBackendProviderId(providerId))}`;
  return joinEndpoint(INTEGRATION_PROVIDER_ENDPOINT, `${path}${action ? `/${action}` : ''}`);
}

function capabilitiesFromTruth(item) {
  if (!item || item.releaseStage === 'PLANNED') return [];
  const capabilities = [];
  if (item.capabilities?.oauth) capabilities.push('oauth');
  if (item.capabilities?.accountsRead) capabilities.push('accounts.read');
  if (item.capabilities?.locationsRead) capabilities.push('locations.read');
  if (item.capabilities?.profileRead) capabilities.push('profile.read');
  if (item.capabilities?.reviewRead || item.capabilities?.reviewIngest) capabilities.push('reviews.read', 'rating.read');
  if (item.capabilities?.reviewReply) capabilities.push('replies.write');
  return capabilities;
}

function normalizeTruth(item) {
  const clientId = getClientProviderId(String(item?.id || '').toLowerCase());
  return {
    ...item,
    id: clientId,
    backendProviderId: String(item?.id || ''),
    capabilitiesList: capabilitiesFromTruth(item),
  };
}

export async function refreshProviderTruth({ signal } = {}) {
  const payload = await apiRequest(joinEndpoint(API_BASE, '/meta/providers'), {
    signal,
    retries: 0,
    timeout: 6000,
  });
  const items = Array.isArray(payload?.providers) ? payload.providers.map(normalizeTruth) : [];
  providerTruthCache = new Map(items.map((item) => [item.id, item]));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PROVIDER_TRUTH_CHANGED_EVENT, { detail: { providers: items } }));
  }
  return items;
}

export function clearProviderTruthCache() {
  providerTruthCache = new Map();
}

export function hasIntegrationBackend() {
  return Boolean(INTEGRATION_PROVIDER_ENDPOINT);
}

export function getProviderTruth(providerId) {
  return providerTruthCache.get(providerId) || null;
}

export function getProviderCapabilities(providerId) {
  return [...(getProviderTruth(providerId)?.capabilitiesList || [])];
}

export function getProviderRuntime(providerId) {
  const truth = getProviderTruth(providerId);
  const releaseStage = truth?.releaseStage || 'UNKNOWN';
  const connectable = Boolean(truth?.configured && truth?.connectable && releaseStage === 'PRODUCTION_ADAPTER');
  return {
    providerId,
    backendProviderId: getBackendProviderId(providerId),
    transport: connectable ? 'backend' : (releaseStage === 'PLANNED' ? 'planned' : 'unavailable'),
    endpointConfigured: Boolean(INTEGRATION_PROVIDER_ENDPOINT),
    adapterInstalled: Boolean(truth && releaseStage !== 'PLANNED'),
    configured: Boolean(truth?.configured),
    connectable,
    releaseStage,
    capabilities: getProviderCapabilities(providerId),
    sync: truth?.sync || { supported: false, frequency: 'unavailable', retryAttempts: null, dedupe: false },
    reasonCode: truth?.availability?.reasonCode || (truth ? null : 'PROVIDER_TRUTH_NOT_LOADED'),
    reasonMessage: truth?.availability?.reasonMessage || null,
  };
}

export async function providerConnect(providerId, payload, { signal } = {}) {
  if (!INTEGRATION_PROVIDER_ENDPOINT) return null;
  return apiRequest(providerPath(providerId, 'connect'), {
    method: 'POST',
    body: payload,
    signal,
    idempotencyKey: createIdempotencyKey(`integration-connect-${providerId}`),
  });
}

export async function providerReconnect(providerId, payload = {}, { signal } = {}) {
  if (!INTEGRATION_PROVIDER_ENDPOINT) return null;
  return apiRequest(providerPath(providerId, 'reconnect'), {
    method: 'POST',
    body: payload,
    signal,
    idempotencyKey: createIdempotencyKey(`integration-reconnect-${providerId}`),
  });
}

export async function providerDisconnect(providerId, { signal } = {}) {
  if (!INTEGRATION_PROVIDER_ENDPOINT) return null;
  return apiRequest(providerPath(providerId, 'disconnect'), {
    method: 'POST',
    signal,
    idempotencyKey: createIdempotencyKey(`integration-disconnect-${providerId}`),
  });
}

export async function providerSync(providerId, { signal } = {}) {
  if (!INTEGRATION_PROVIDER_ENDPOINT) return null;
  return apiRequest(providerPath(providerId, 'sync'), {
    method: 'POST',
    signal,
    idempotencyKey: createIdempotencyKey(`integration-sync-${providerId}`),
  });
}

export async function providerSyncStatus(providerId, { signal } = {}) {
  if (!INTEGRATION_PROVIDER_ENDPOINT) return { providerId: getBackendProviderId(providerId), accountId: null, lastSyncedAt: null, run: null };
  return apiRequest(providerPath(providerId, 'sync-status'), { signal, retries: 0 });
}

export async function providerDiagnostics(providerId, { signal } = {}) {
  if (!INTEGRATION_PROVIDER_ENDPOINT) return null;
  return apiRequest(providerPath(providerId, 'diagnostics'), { signal, retries: 0 });
}

export async function googleBusinessOAuthStart({ signal } = {}) {
  if (!INTEGRATION_PROVIDER_ENDPOINT) return null;
  return apiRequest(providerPath('google', 'oauth/start'), {
    method: 'POST',
    signal,
    idempotencyKey: createIdempotencyKey('google-business-oauth-start'),
  });
}

export async function googleBusinessAccounts({ signal } = {}) {
  if (!INTEGRATION_PROVIDER_ENDPOINT) return { accounts: [] };
  return apiRequest(providerPath('google', 'accounts'), { signal, retries: 0 });
}

export async function googleBusinessLocations(accountName, { signal } = {}) {
  if (!INTEGRATION_PROVIDER_ENDPOINT) return { locations: [] };
  const match = /^accounts\/([A-Za-z0-9_-]+)$/.exec(String(accountName || ''));
  if (!match) throw new Error('Некорректный Google Business account');
  return apiRequest(providerPath('google', `accounts/${encodeURIComponent(match[1])}/locations`), { signal, retries: 0 });
}

export async function googleBusinessSelect(selection, { signal } = {}) {
  if (!INTEGRATION_PROVIDER_ENDPOINT) return null;
  return apiRequest(providerPath('google', 'selection'), {
    method: 'PUT',
    body: selection,
    signal,
    idempotencyKey: createIdempotencyKey('google-business-selection'),
  });
}
