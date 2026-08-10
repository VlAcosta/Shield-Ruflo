import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { getRuntimeEnv } from '../core/runtimeEnv';

export const INTEGRATION_PROVIDER_ENDPOINT = getRuntimeEnv('INTEGRATIONS_ENDPOINT', '');

const BACKEND_PROVIDER_IDS = Object.freeze({
  google: 'google-business-profile',
});

export const PROVIDER_CAPABILITIES = Object.freeze({
  yandex: ['reviews.read', 'rating.read', 'replies.write'],
  gis: ['reviews.read', 'rating.read', 'replies.write'],
  ozon: ['reviews.read', 'rating.read', 'marketplace.read', 'replies.write'],
  otzovik: ['reviews.read', 'rating.read'],
  wb: ['reviews.read', 'rating.read', 'marketplace.read', 'replies.write'],
  google: ['oauth', 'accounts.read', 'locations.read', 'profile.read', 'reviews.read'],
  telegram: ['notifications.write'],
  whatsapp: ['notifications.write'],
  amo: ['crm.read', 'crm.write'],
});

export function getBackendProviderId(providerId) {
  return BACKEND_PROVIDER_IDS[providerId] || providerId;
}

function providerPath(providerId, action = '') {
  const path = `/providers/${encodeURIComponent(getBackendProviderId(providerId))}`;
  return joinEndpoint(INTEGRATION_PROVIDER_ENDPOINT, `${path}${action ? `/${action}` : ''}`);
}

export function hasIntegrationBackend() {
  return Boolean(INTEGRATION_PROVIDER_ENDPOINT);
}

export function getProviderCapabilities(providerId) {
  return PROVIDER_CAPABILITIES[providerId] || [];
}

export function getProviderRuntime(providerId) {
  return {
    providerId,
    backendProviderId: getBackendProviderId(providerId),
    transport: INTEGRATION_PROVIDER_ENDPOINT ? 'backend' : 'unresolved',
    endpointConfigured: Boolean(INTEGRATION_PROVIDER_ENDPOINT),
    capabilities: getProviderCapabilities(providerId),
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
