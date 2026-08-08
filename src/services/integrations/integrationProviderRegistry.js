import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { getRuntimeEnv } from '../core/runtimeEnv';

export const INTEGRATION_PROVIDER_ENDPOINT = getRuntimeEnv('INTEGRATIONS_ENDPOINT', '');

export const PROVIDER_CAPABILITIES = Object.freeze({
  yandex: ['reviews.read', 'rating.read', 'replies.write'],
  gis: ['reviews.read', 'rating.read', 'replies.write'],
  ozon: ['reviews.read', 'rating.read', 'marketplace.read', 'replies.write'],
  otzovik: ['reviews.read', 'rating.read'],
  wb: ['reviews.read', 'rating.read', 'marketplace.read', 'replies.write'],
  google: ['reviews.read', 'rating.read', 'replies.write'],
  telegram: ['notifications.write'],
  whatsapp: ['notifications.write'],
  amo: ['crm.read', 'crm.write'],
});

function providerPath(providerId, action = '') {
  const path = `/providers/${encodeURIComponent(providerId)}`;
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

export async function providerDiagnostics(providerId, { signal } = {}) {
  if (!INTEGRATION_PROVIDER_ENDPOINT) return null;
  return apiRequest(providerPath(providerId, 'diagnostics'), { signal, retries: 0 });
}
