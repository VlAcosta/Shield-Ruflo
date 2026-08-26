import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { INTEGRATION_BY_ID, INTEGRATION_ITEMS } from '../../features/integrations/model/integrationCatalog';
import {
  getClientProviderId,
  getProviderCapabilities,
  getProviderRuntime,
  hasIntegrationBackend,
  providerAccounts,
  providerConnect,
  providerDiagnostics,
  providerDisconnect,
  providerReconnect,
  providerSync,
} from './integrationProviderRegistry';

export const INTEGRATIONS_CACHE_KEY = 'business-shield:integrations:v2';
export const LEGACY_INTEGRATIONS_CACHE_KEY = 'connectedIntegrations';
export const LEGACY_INTEGRATIONS_V1_KEY = 'business-shield:integrations:v1';
export const INTEGRATIONS_CHANGED_EVENT = 'business-shield:integrations-changed';
export const INTEGRATION_ACTIVITY_KEY = 'business-shield:integrations-activity:v1';
export const INTEGRATION_ACTIVITY_EVENT = 'business-shield:integrations-activity';

const nowIso = () => new Date().toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));

function frontendStatus(value, fallback = 'disconnected') {
  const status = String(value || '').trim().toLowerCase();
  return status || fallback;
}

function defaultStatus(value, link) {
  if (value?.status) return frontendStatus(value.status);
  if (value?.enabled === false) return 'disconnected';
  if (link) return 'configured';
  return value?.enabled ? 'needs_setup' : 'disconnected';
}

function runtimeProviderMode(value, runtime) {
  if (runtime.releaseStage === 'UNKNOWN') return value?.providerMode || runtime.transport;
  return runtime.transport;
}

function runtimeCapabilities(value, runtime, providerId) {
  if (runtime.releaseStage === 'UNKNOWN' && Array.isArray(value?.capabilities)) return value.capabilities;
  return getProviderCapabilities(providerId);
}

function normalizeItem(value) {
  const id = String(value?.id || '').trim();
  if (!id) return null;
  const meta = INTEGRATION_BY_ID[id] || {};
  const link = String(value?.link || '').trim();
  const enabled = value?.enabled !== false;
  const runtime = getProviderRuntime(id);
  const status = enabled ? defaultStatus(value, link) : 'disconnected';

  return {
    id,
    name: value?.name || value?.title || meta.name || id,
    shortName: value?.shortName || meta.shortName || meta.name || id,
    category: value?.category || meta.category || 'Интеграция',
    description: value?.description || meta.description || '',
    tone: value?.tone || meta.tone || 'violet',
    sourceType: value?.sourceType || meta.sourceType || 'integration',
    recommended: value?.recommended ?? meta.recommended ?? false,
    link,
    enabled,
    status,
    providerMode: runtimeProviderMode(value, runtime),
    capabilities: runtimeCapabilities(value, runtime, id),
    connectedAt: value?.connectedAt || null,
    lastSyncAt: value?.lastSyncAt || null,
    lastSuccessAt: value?.lastSuccessAt || null,
    lastErrorAt: value?.lastErrorAt || null,
    lastError: value?.lastError || '',
    syncCursor: value?.syncCursor || null,
    syncPolicy: value?.syncPolicy || null,
    authorizationUrl: value?.authorizationUrl || value?.authorization_url || '',
    requiresAuthorization: Boolean(value?.requiresAuthorization || value?.requires_authorization),
    nextSyncAt: value?.nextSyncAt || value?.next_sync_at || value?.syncPolicy?.nextSyncAt || null,
    lastSyncStats: value?.lastSyncStats || value?.stats || null,
    diagnostics: value?.diagnostics || null,
    updatedAt: value?.updatedAt || nowIso(),
  };
}

function readRawIntegrations() {
  if (typeof window === 'undefined') return [];
  const scoped = readScopedJson(INTEGRATIONS_CACHE_KEY, { scope: getCompanyScope(), fallback: null });
  if (Array.isArray(scoped)) return scoped;

  const legacyV1 = readScopedJson(LEGACY_INTEGRATIONS_V1_KEY, { scope: getCompanyScope(), legacy: true, fallback: null });
  if (Array.isArray(legacyV1) && legacyV1.length) {
    writeScopedJson(INTEGRATIONS_CACHE_KEY, legacyV1, { scope: getCompanyScope() });
    return legacyV1;
  }

  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_INTEGRATIONS_CACHE_KEY) || '[]');
    if (Array.isArray(legacy) && legacy.length) {
      writeScopedJson(INTEGRATIONS_CACHE_KEY, legacy, { scope: getCompanyScope() });
      localStorage.removeItem(LEGACY_INTEGRATIONS_CACHE_KEY);
      return legacy;
    }
  } catch { /* no legacy integrations */ }
  return [];
}

export function readConnectedIntegrations() {
  return readRawIntegrations().map(normalizeItem).filter(Boolean).filter((item) => item.enabled);
}

export function readIntegrationConnections({ includeDisabled = true } = {}) {
  const saved = readRawIntegrations().map(normalizeItem).filter(Boolean);
  const map = new Map(saved.map((item) => [item.id, item]));
  const merged = INTEGRATION_ITEMS.map((meta) => map.get(meta.id) || normalizeItem({ ...meta, enabled: false, status: 'disconnected' }));
  saved.forEach((item) => { if (!INTEGRATION_BY_ID[item.id]) merged.push(item); });
  return includeDisabled ? merged : merged.filter((item) => item.enabled);
}

function writeIntegrations(values, reason = 'update') {
  const normalized = values.map(normalizeItem).filter(Boolean);
  writeScopedJson(INTEGRATIONS_CACHE_KEY, normalized, { scope: getCompanyScope() });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(INTEGRATIONS_CHANGED_EVENT, {
      detail: { integrations: clone(normalized), reason },
    }));
  }
  return normalized;
}

function remoteLink(account, fallback = '') {
  const configuration = account?.configuration && typeof account.configuration === 'object' && !Array.isArray(account.configuration)
    ? account.configuration
    : {};
  return String(
    configuration.sourceLink
    || configuration.externalId
    || configuration.placeId
    || configuration.nmId
    || account?.externalAccountId
    || fallback
    || '',
  ).trim();
}

function remoteAccountPatch(account, current) {
  const status = frontendStatus(account?.status);
  const enabled = status !== 'disconnected';
  const lastError = String(account?.lastErrorMessage || '');
  return {
    enabled,
    status: enabled ? status : 'disconnected',
    link: remoteLink(account, current?.link),
    providerMode: 'backend',
    connectedAt: current?.connectedAt || (['connected', 'degraded'].includes(status) ? account?.lastValidatedAt || null : null),
    lastSyncAt: account?.lastSyncedAt || null,
    lastSuccessAt: account?.lastValidatedAt || account?.lastSyncedAt || null,
    lastError,
    lastErrorAt: lastError ? account?.updatedAt || nowIso() : null,
    syncPolicy: account?.syncPolicy || null,
    nextSyncAt: account?.syncPolicy?.nextSyncAt || null,
    updatedAt: account?.updatedAt || nowIso(),
  };
}

export function hydrateIntegrationAccounts(accounts = []) {
  const current = readIntegrationConnections();
  const remoteByProvider = new Map();
  for (const account of Array.isArray(accounts) ? accounts : []) {
    const providerId = getClientProviderId(String(account?.provider || '').trim().toLowerCase());
    if (!providerId || remoteByProvider.has(providerId)) continue;
    remoteByProvider.set(providerId, account);
  }

  const next = current.map((item) => {
    const account = remoteByProvider.get(item.id);
    if (account) return { ...item, ...remoteAccountPatch(account, item), id: item.id };

    const runtime = getProviderRuntime(item.id);
    if (runtime.releaseStage !== 'UNKNOWN') {
      return {
        ...item,
        enabled: false,
        status: 'disconnected',
        providerMode: runtime.transport,
        connectedAt: null,
        lastSyncAt: null,
        lastSuccessAt: null,
        lastError: '',
        lastErrorAt: null,
        syncPolicy: null,
        nextSyncAt: null,
      };
    }
    return item;
  });

  return writeIntegrations(next, 'backend-hydrate');
}

export async function refreshIntegrationConnections(options = {}) {
  if (!hasIntegrationBackend()) return readIntegrationConnections();
  const payload = await providerAccounts(options);
  return hydrateIntegrationAccounts(payload?.integrations || []);
}

export function saveConnectedIntegrations(values = []) {
  const current = readIntegrationConnections();
  const incoming = new Map(values.map((value) => [value.id, value]));
  const next = current.map((item) => {
    const value = incoming.get(item.id);
    if (!value) return { ...item, enabled: false, status: 'disconnected', updatedAt: nowIso() };
    const link = String(value.link || '').trim();
    return {
      ...item,
      ...value,
      enabled: value.enabled !== false,
      link,
      status: value.status || (link ? (item.status === 'connected' ? 'connected' : 'configured') : 'needs_setup'),
      updatedAt: nowIso(),
    };
  });
  return writeIntegrations(next, 'save');
}

export function integrationsFromOnboardingState(state = {}) {
  return INTEGRATION_ITEMS
    .filter((item) => state[item.id]?.enabled)
    .map((item) => {
      const runtime = getProviderRuntime(item.id);
      return {
        ...item,
        enabled: true,
        link: String(state[item.id]?.link || '').trim(),
        status: String(state[item.id]?.link || '').trim() ? 'configured' : 'needs_setup',
        providerMode: runtime.releaseStage === 'UNKNOWN' ? 'unresolved' : runtime.transport,
        capabilities: runtime.releaseStage === 'UNKNOWN' ? [] : runtime.capabilities,
        connectedAt: null,
        updatedAt: nowIso(),
      };
    });
}

function readActivity() {
  return readScopedJson(INTEGRATION_ACTIVITY_KEY, { scope: getCompanyScope(), fallback: [] }) || [];
}

export function readIntegrationActivity(limit = 40) {
  return readActivity().slice(0, Math.max(1, limit));
}

function appendActivity(entry) {
  const next = [{
    id: `integration-log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: nowIso(),
    level: 'info',
    ...entry,
  }, ...readActivity()].slice(0, 120);
  writeScopedJson(INTEGRATION_ACTIVITY_KEY, next, { scope: getCompanyScope() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(INTEGRATION_ACTIVITY_EVENT, { detail: { activity: clone(next) } }));
  return next;
}

function updateOne(id, patch, reason = 'update') {
  const current = readIntegrationConnections();
  const index = current.findIndex((item) => item.id === id);
  if (index < 0) throw new Error('Интеграция не найдена');
  const next = current.map((item, itemIndex) => itemIndex === index ? normalizeItem({ ...item, ...patch, id, updatedAt: nowIso() }) : item);
  writeIntegrations(next, reason);
  return next[index];
}

function normalizeRemote(providerId, payload, fallback = {}) {
  if (!payload || typeof payload !== 'object') return fallback;
  const connection = payload.connection || payload.integration || payload;
  const authorizationUrl = payload.authorization_url || payload.authorizationUrl || connection.authorization_url || connection.authorizationUrl || '';
  return {
    ...fallback,
    ...connection,
    id: providerId,
    enabled: connection.enabled !== false,
    status: connection.status ? frontendStatus(connection.status) : fallback.status,
    providerMode: 'backend',
    authorizationUrl,
    requiresAuthorization: Boolean(payload.requires_authorization || payload.requiresAuthorization || connection.requires_authorization || connection.requiresAuthorization || authorizationUrl),
  };
}

function providerUnavailableError(providerId) {
  const runtime = getProviderRuntime(providerId);
  const error = new Error(runtime.reasonMessage || 'Production provider adapter пока недоступен');
  error.code = runtime.reasonCode || 'PROVIDER_ADAPTER_NOT_CONFIGURED';
  return error;
}

function recordUnavailableProvider(providerId, current, action) {
  const runtime = getProviderRuntime(providerId);
  const error = providerUnavailableError(providerId);
  const next = updateOne(providerId, {
    enabled: current.enabled !== false,
    status: action === 'sync' && current.status === 'connected' ? 'degraded' : 'error',
    providerMode: runtime.transport,
    lastError: error.message,
    lastErrorAt: nowIso(),
  }, `${action}-provider-unavailable`);
  appendActivity({
    providerId,
    providerName: next.name,
    action: `${action}_unavailable`,
    level: 'warning',
    message: error.message,
  });
  throw error;
}

export async function configureIntegration(providerId, {
  link = '',
  metadata = {},
  configuration = {},
  credentials = {},
  syncPolicy,
  externalAccountId,
} = {}, options = {}) {
  const trimmedLink = String(link || '').trim();
  const current = readIntegrationConnections().find((item) => item.id === providerId);
  if (!current) throw new Error('Неизвестная интеграция');

  if (!hasIntegrationBackend()) {
    const next = updateOne(providerId, {
      enabled: true,
      link: trimmedLink,
      status: trimmedLink ? 'configured' : 'needs_setup',
      providerMode: 'unresolved',
      lastError: '',
    }, 'configure-local');
    appendActivity({ providerId, providerName: next.name, action: 'configured', level: 'info', message: trimmedLink ? 'Источник настроен. Ожидается подключение provider API.' : 'Источник включён и ожидает настройки.' });
    return next;
  }
  if (!hasIntegrationBackend(providerId)) {
    const staged = updateOne(providerId, { enabled: true, link: trimmedLink }, 'configure-staged');
    return recordUnavailableProvider(providerId, staged, 'connect');
  }

  updateOne(providerId, { enabled: true, link: trimmedLink, status: 'syncing', lastError: '' }, 'connect-start');
  try {
    const response = await providerConnect(providerId, {
      link: trimmedLink,
      metadata,
      configuration,
      credentials,
      ...(syncPolicy ? { syncPolicy } : {}),
      ...(externalAccountId !== undefined ? { externalAccountId } : {}),
    }, options);
    const remote = normalizeRemote(providerId, response, {});
    const next = updateOne(providerId, {
      ...remote,
      enabled: true,
      link: remote.link ?? trimmedLink,
      status: remote.status || (remote.requiresAuthorization ? 'expired' : 'connected'),
      connectedAt: remote.connectedAt || nowIso(),
      lastSuccessAt: remote.lastSuccessAt || remote.lastValidatedAt || nowIso(),
      lastError: '',
      authorizationUrl: remote.authorizationUrl || '',
      requiresAuthorization: Boolean(remote.requiresAuthorization),
      syncPolicy: remote.syncPolicy || current.syncPolicy || syncPolicy || null,
      nextSyncAt: remote.syncPolicy?.nextSyncAt || remote.nextSyncAt || null,
    }, 'connect-success');
    appendActivity({ providerId, providerName: next.name, action: 'connected', level: 'success', message: 'Подключение подтверждено provider backend.' });
    return next;
  } catch (error) {
    const next = updateOne(providerId, { enabled: true, link: trimmedLink, status: 'error', lastError: error.message || 'Ошибка подключения', lastErrorAt: nowIso() }, 'connect-error');
    appendActivity({ providerId, providerName: next.name, action: 'connect_error', level: 'error', message: next.lastError });
    throw error;
  }
}

export async function reconnectIntegration(providerId, options = {}) {
  const current = readIntegrationConnections().find((item) => item.id === providerId);
  if (!current) throw new Error('Интеграция не найдена');
  if (!hasIntegrationBackend()) return configureIntegration(providerId, { link: current.link }, options);
  if (!hasIntegrationBackend(providerId)) return recordUnavailableProvider(providerId, current, 'reconnect');

  updateOne(providerId, { status: 'syncing', lastError: '' }, 'reconnect-start');
  try {
    const response = await providerReconnect(providerId, { link: current.link }, options);
    const remote = normalizeRemote(providerId, response, {});
    const next = updateOne(providerId, { ...remote, status: remote.status || (remote.requiresAuthorization ? 'expired' : 'connected'), lastSuccessAt: remote.lastSuccessAt || remote.lastValidatedAt || nowIso(), lastError: '', authorizationUrl: remote.authorizationUrl || '', requiresAuthorization: Boolean(remote.requiresAuthorization) }, 'reconnect-success');
    appendActivity({ providerId, providerName: next.name, action: 'reconnected', level: 'success', message: 'Доступ к источнику восстановлен.' });
    return next;
  } catch (error) {
    const next = updateOne(providerId, { status: 'error', lastError: error.message || 'Ошибка переподключения', lastErrorAt: nowIso() }, 'reconnect-error');
    appendActivity({ providerId, providerName: next.name, action: 'reconnect_error', level: 'error', message: next.lastError });
    throw error;
  }
}

export async function disconnectIntegration(providerId, options = {}) {
  const current = readIntegrationConnections().find((item) => item.id === providerId);
  if (!current) throw new Error('Интеграция не найдена');
  if (hasIntegrationBackend()) await providerDisconnect(providerId, options);
  const next = updateOne(providerId, { enabled: false, status: 'disconnected', lastError: '', connectedAt: null }, 'disconnect');
  appendActivity({ providerId, providerName: next.name, action: 'disconnected', level: 'warning', message: 'Источник отключён от рабочего пространства.' });
  return next;
}

export async function syncIntegration(providerId, options = {}) {
  const current = readIntegrationConnections().find((item) => item.id === providerId);
  if (!current || !current.enabled) throw new Error('Сначала подключите источник');
  if (!hasIntegrationBackend()) {
    appendActivity({ providerId, providerName: current.name, action: 'sync_skipped', level: 'warning', message: 'Provider API пока не настроен — реальная синхронизация не запускалась.' });
    return updateOne(providerId, { status: current.link ? 'configured' : 'needs_setup', providerMode: 'unresolved' }, 'sync-local');
  }
  if (!hasIntegrationBackend(providerId)) return recordUnavailableProvider(providerId, current, 'sync');

  updateOne(providerId, { status: 'syncing', lastError: '' }, 'sync-start');
  try {
    const response = await providerSync(providerId, options);
    const remote = normalizeRemote(providerId, response, {});
    const next = updateOne(providerId, {
      ...remote,
      status: remote.status || 'syncing',
      lastError: '',
      lastSyncStats: response?.stats || remote.lastSyncStats || null,
      nextSyncAt: response?.next_sync_at || response?.nextSyncAt || remote.nextSyncAt || null,
    }, 'sync-success');
    appendActivity({ providerId, providerName: next.name, action: 'sync', level: 'success', message: 'Синхронизация поставлена в durable очередь.', details: response?.stats || null });
    return next;
  } catch (error) {
    const next = updateOne(providerId, { status: 'degraded', lastError: error.message || 'Ошибка синхронизации', lastErrorAt: nowIso() }, 'sync-error');
    appendActivity({ providerId, providerName: next.name, action: 'sync_error', level: 'error', message: next.lastError });
    throw error;
  }
}

export async function diagnoseIntegration(providerId, options = {}) {
  const current = readIntegrationConnections().find((item) => item.id === providerId);
  if (!current) throw new Error('Интеграция не найдена');

  if (!hasIntegrationBackend()) {
    const checks = [
      { id: 'config', label: 'Источник включён', ok: current.enabled },
      { id: 'identity', label: 'Ссылка или идентификатор указан', ok: Boolean(current.link) },
      { id: 'provider', label: 'Provider backend подключён', ok: false, pending: true },
    ];
    const diagnostics = { checkedAt: nowIso(), mode: 'local', checks, ok: checks.filter((item) => !item.pending).every((item) => item.ok) };
    const next = updateOne(providerId, { diagnostics, status: current.link ? 'configured' : 'needs_setup' }, 'diagnostics-local');
    appendActivity({ providerId, providerName: next.name, action: 'diagnostics', level: 'info', message: 'Локальная диагностика завершена. Provider backend пока не подключён.' });
    return diagnostics;
  }

  try {
    const diagnostics = await providerDiagnostics(providerId, options);
    const ok = diagnostics?.ok !== false && diagnostics?.availability?.connectable !== false;
    updateOne(providerId, {
      diagnostics: { ...diagnostics, checkedAt: diagnostics?.checkedAt || nowIso() },
      status: ok ? (current.status === 'syncing' ? 'connected' : current.status) : 'degraded',
      lastError: ok ? '' : (diagnostics?.availability?.reasonMessage || current.lastError || 'Provider adapter недоступен'),
      lastErrorAt: ok ? null : nowIso(),
    }, 'diagnostics');
    appendActivity({ providerId, providerName: current.name, action: 'diagnostics', level: ok ? 'success' : 'warning', message: ok ? 'Диагностика не обнаружила проблем.' : 'Диагностика обнаружила проблему подключения.' });
    return diagnostics;
  } catch (error) {
    updateOne(providerId, { status: 'degraded', lastError: error.message || 'Диагностика недоступна', lastErrorAt: nowIso() }, 'diagnostics-error');
    appendActivity({ providerId, providerName: current.name, action: 'diagnostics_error', level: 'error', message: error.message || 'Диагностика недоступна' });
    throw error;
  }
}

export function getIntegrationHealth(connections = readIntegrationConnections()) {
  const enabled = connections.filter((item) => item.enabled);
  const runtimeUnavailable = (item) => ['planned', 'unavailable'].includes(item.providerMode);
  const connected = enabled.filter((item) => item.status === 'connected' && !runtimeUnavailable(item)).length;
  const configured = enabled.filter((item) => item.status === 'configured' && !runtimeUnavailable(item)).length;
  const syncing = enabled.filter((item) => item.status === 'syncing' && !runtimeUnavailable(item)).length;
  const issues = enabled.filter((item) => runtimeUnavailable(item) || ['error', 'expired', 'degraded', 'needs_setup'].includes(item.status)).length;
  const operational = connected + configured + syncing;
  const score = enabled.length ? Math.round((operational / enabled.length) * 100) : 0;
  return { total: connections.length, enabled: enabled.length, connected, configured, syncing, issues, score };
}
