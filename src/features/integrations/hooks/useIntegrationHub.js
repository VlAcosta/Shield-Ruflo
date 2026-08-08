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
  syncIntegration,
} from '../../../services/integrations/integrationService';

export default function useIntegrationHub() {
  const [connections, setConnections] = useState(() => readIntegrationConnections());
  const [activity, setActivity] = useState(() => readIntegrationActivity());
  const [busy, setBusy] = useState({});
  const [error, setError] = useState('');

  const refresh = useCallback(() => {
    setConnections(readIntegrationConnections());
    setActivity(readIntegrationActivity());
  }, []);

  useEffect(() => {
    const onStorage = () => refresh();
    window.addEventListener(INTEGRATIONS_CHANGED_EVENT, refresh);
    window.addEventListener(INTEGRATION_ACTIVITY_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(INTEGRATIONS_CHANGED_EVENT, refresh);
      window.removeEventListener(INTEGRATION_ACTIVITY_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [refresh]);

  const run = useCallback(async (id, action, callback) => {
    setError('');
    setBusy((state) => ({ ...state, [id]: action }));
    try {
      const result = await callback();
      refresh();
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
  }, [refresh]);

  const configure = useCallback((id, payload) => run(id, 'configure', () => configureIntegration(id, payload)), [run]);
  const reconnect = useCallback((id) => run(id, 'reconnect', () => reconnectIntegration(id)), [run]);
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
  };
}
