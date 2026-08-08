import { useCallback, useEffect, useState } from 'react';
import {
  DASHBOARD_FIRST_RUN_CHANGED_EVENT,
  DASHBOARD_FIRST_RUN_KEY,
  ONBOARDING_CONFIGURATION_KEY,
  dismissDashboardFirstRun,
  markDashboardWorkspaceOpened,
  readDashboardFirstRunSnapshot,
  saveDashboardSourceLink,
} from '../../../services/dashboard/dashboardFirstRunService';
import {
  INTEGRATIONS_CACHE_KEY,
  INTEGRATIONS_CHANGED_EVENT,
  LEGACY_INTEGRATIONS_CACHE_KEY,
} from '../../../services/integrations/integrationService';
import {
  PIN_PREFERENCES_KEY,
  SECURITY_PREFERENCES_CHANGED_EVENT,
} from '../../../services/security/securityPreferencesService';

export default function useDashboardFirstRun() {
  const [snapshot, setSnapshot] = useState(readDashboardFirstRunSnapshot);

  const refresh = useCallback(() => {
    setSnapshot(readDashboardFirstRunSnapshot());
  }, []);

  useEffect(() => {
    const onStorage = (event) => {
      if (!event.key || [LEGACY_INTEGRATIONS_CACHE_KEY, 'portal_pin_code'].includes(event.key) || event.key.startsWith(ONBOARDING_CONFIGURATION_KEY) || event.key.startsWith(DASHBOARD_FIRST_RUN_KEY) || event.key.startsWith(INTEGRATIONS_CACHE_KEY) || event.key.startsWith(PIN_PREFERENCES_KEY)) {
        refresh();
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener(DASHBOARD_FIRST_RUN_CHANGED_EVENT, refresh);
    window.addEventListener(INTEGRATIONS_CHANGED_EVENT, refresh);
    window.addEventListener(SECURITY_PREFERENCES_CHANGED_EVENT, refresh);
    window.addEventListener('business-shield:onboarding-completed', refresh);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(DASHBOARD_FIRST_RUN_CHANGED_EVENT, refresh);
      window.removeEventListener(INTEGRATIONS_CHANGED_EVENT, refresh);
      window.removeEventListener(SECURITY_PREFERENCES_CHANGED_EVENT, refresh);
      window.removeEventListener('business-shield:onboarding-completed', refresh);
    };
  }, [refresh]);

  const markWorkspaceOpened = useCallback(() => {
    setSnapshot(markDashboardWorkspaceOpened());
  }, []);

  const dismiss = useCallback(() => {
    setSnapshot(dismissDashboardFirstRun());
  }, []);

  const saveSourceLink = useCallback((integrationId, link) => {
    const next = saveDashboardSourceLink(integrationId, link);
    setSnapshot(next);
    return next;
  }, []);

  return {
    ...snapshot,
    refresh,
    markWorkspaceOpened,
    dismiss,
    saveSourceLink,
  };
}
