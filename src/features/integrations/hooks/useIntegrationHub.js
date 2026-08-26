import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  configureIntegration,
  diagnoseIntegration,
  disconnectIntegration,
  getIntegrationHealth,
  INTEGRATION_ACTIVITY_EVENT,
  INTEGRATIONS_CHANGED_EVENT,
  readIntegrationActivity,
  readIntegrationConnections,
  reconnectIntegration,
  refreshIntegrationConnections,
  saveConnectedIntegrations,
  syncIntegration,
} from '../../../services/integrations/integrationService';
import {
  googleBusinessAccounts,
  googleBusinessLocations,
  googleBusinessOAuthStart,
  googleBusinessSelect,
  PROVIDER_TRUTH_CHANGED_EVENT,
  refreshProviderTruth,
} from '../../../services/integrations/integrationProviderRegistry';

function frontendStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return status || 'disconnected';
}

function applyGoogleRemote(current, payload) {
  const remote = payload?.integration || payload;
  if (!remote || typeof remote !== 'object') return current;
  const now = new Date().toISOString();
  return current.map((item) => item.id === 'google' ? {
    ...item,
    enabled: remote.status !== 'DISCONNECTED',
    status: frontendStatus(remote.status),
    providerMode: 'backend',
    link: remote.configuration?.sourceLink || item.link || '',
    lastSyncAt: remote.lastSyncedAt || item.lastSyncAt || null,
    lastSuccessAt: remote.lastValidatedAt || item.lastSuccessAt || now,
    lastError: remote.lastErrorMessage || '',
    lastErrorAt: remote.lastErrorMessage ? now : null,
    syncPolicy: remote.syncPolicy || item.syncPolicy || null,
    nextSyncAt: remote.syncPolicy?.nextSyncAt || item.nextSyncAt || null,
    updatedAt: remote.updatedAt || now,
  } : item);
}

export default function useIntegrationHub() {
  const [connections, setConnections] = useState(() => readIntegrationConnections());
  const [activity, setActivity] = useState(() => readIntegrationActivity());
  const [busy, setBusy] = useState({});
  const [error, setError] = useState('');

  const refreshLocal = useCallback(() => {
    setConnections(readIntegrationConnections());
    setActivity(readIntegrationActivity());
  }, []);

  const refresh = useCallback(async () => {
    setError('');
    try {
      await refreshProviderTruth();
      await refreshIntegrationConnections();
    } catch (requestError) {
      if (requestError?.name !== 'AbortError') {
        setError(requestError?.message || 'Не удалось обновить состояние интеграций');
      }
    } finally {
      refreshLocal();
    }
  }, [refreshLocal]);

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        await refreshProviderTruth({ signal: controller.signal });
        await refreshIntegrationConnections({ signal: controller.signal });
      } catch (requestError) {
        if (requestError?.name !== 'AbortError') refreshLocal();
        return;
      }
      refreshLocal();
    };
    load();
    return () => controller.abort();
  }, [refreshLocal]);

  useEffect(() => {
    const onStorage = () => refreshLocal();
    window.addEventListener(INTEGRATIONS_CHANGED_EVENT, refreshLocal);
    window.addEventListener(INTEGRATION_ACTIVITY_EVENT, refreshLocal);
    window.addEventListener(PROVIDER_TRUTH_CHANGED_EVENT, refreshLocal);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(INTEGRATIONS_CHANGED_EVENT, refreshLocal);
      window.removeEventListener(INTEGRATION_ACTIVITY_EVENT, refreshLocal);
      window.removeEventListener(PROVIDER_TRUTH_CHANGED_EVENT, refreshLocal);
      window.removeEventListener('storage', onStorage);
    };
  }, [refreshLocal]);

  const run = useCallback(async (id, action, callback) => {
    setError('');
    setBusy((state) => ({ ...state, [id]: action }));
    try {
      const result = await callback();
      refreshLocal();
      return result;
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось выполнить действие');
      throw requestError;
    } finally {
      setBusy((state) => {
        const next = { ...state };
        delete next[id];
        return next;
      });
    }
  }, [refreshLocal]);

  const configure = useCallback((id, payload) => run(id, 'configure', () => configureIntegration(id, payload)), [run]);
  const startGoogleOAuth = useCallback(() => run('google', 'oauth', () => googleBusinessOAuthStart()), [run]);
  const loadGoogleAccounts = useCallback(() => run('google', 'accounts', () => googleBusinessAccounts()), [run]);
  const loadGoogleLocations = useCallback((accountName) => run('google', 'locations', () => googleBusinessLocations(accountName)), [run]);
  const completeGoogleSelection = useCallback((selection) => run('google', 'selection', async () => {
    const response = await googleBusinessSelect(selection);
    const next = applyGoogleRemote(readIntegrationConnections(), response);
    saveConnectedIntegrations(next);
    return response;
  }), [run]);
  const reconnect = useCallback((id) => (
    id === 'google'
      ? startGoogleOAuth()
      : run(id, 'reconnect', () => reconnectIntegration(id))
  ), [run, startGoogleOAuth]);
  const disconnect = useCallback((id) => run(id, 'disconnect', () => disconnectIntegration(id)), [run]);
  const sync = useCallback((id) => run(id, 'sync', () => syncIntegration(id)), [run]);
  const diagnose = useCallback((id) => run(id, 'diagnostics', () => diagnoseIntegration(id)), [run]);

  const metrics = useMemo(() => getIntegrationHealth(connections), [connections]);

  return {
    connections,
    activity,
    metrics,
    busy,
    error,
    clearError: () => setError(''),
    refresh,
    configure,
    reconnect,
    disconnect,
    sync,
    diagnose,
    startGoogleOAuth,
    loadGoogleAccounts,
    loadGoogleLocations,
    completeGoogleSelection,
  };
}
