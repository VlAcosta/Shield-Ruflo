import { useEffect, useState } from 'react';
import {
  INTEGRATIONS_CACHE_KEY,
  INTEGRATIONS_CHANGED_EVENT,
  LEGACY_INTEGRATIONS_CACHE_KEY,
  readConnectedIntegrations,
} from '../../../services/integrations/integrationService';

export default function useConnectedIntegrations() {
  const [integrations, setIntegrations] = useState(readConnectedIntegrations);

  useEffect(() => {
    const refresh = () => setIntegrations(readConnectedIntegrations());
    const onStorage = (event) => {
      if (!event.key || event.key.startsWith(INTEGRATIONS_CACHE_KEY) || event.key === LEGACY_INTEGRATIONS_CACHE_KEY) {
        refresh();
      }
    };

    window.addEventListener(INTEGRATIONS_CHANGED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(INTEGRATIONS_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return integrations;
}
