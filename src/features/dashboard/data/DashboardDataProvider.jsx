import React, { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DASHBOARD_OVERVIEW_CACHE_KEY,
  DASHBOARD_OVERVIEW_CHANGED_EVENT,
  getDashboardOverview,
  isDashboardOverviewApiEnabled,
  readDashboardOverviewCache,
} from '../../../services/dashboard/dashboardOverviewService';
import { REVIEWS_CHANGED_EVENT } from '../../../services/reviews/reviewsService';
import { TASKS_CHANGED_EVENT } from '../../../services/tasks/taskService';
import { REPORTS_CHANGED_EVENT } from '../../../services/reports/reportService';
import { INTEGRATIONS_CHANGED_EVENT } from '../../../services/integrations/integrationService';
import { PROFILE_CHANGED_EVENT } from '../../../services/profile/profileService';
import { SECURITY_PREFERENCES_CHANGED_EVENT } from '../../../services/security/securityPreferencesService';
import { SUBSCRIPTION_CHANGED_EVENT } from '../../../services/subscriptions/subscriptionService';

export const DashboardDataContext = createContext(null);
const REVALIDATE_DELAY = 180;

function initialState() {
  const cached = readDashboardOverviewCache();
  if (!cached) return { data: null, status: 'loading', source: 'none', stale: false, error: null, fetchedAt: 0, refreshing: false };
  return {
    data: cached.data,
    status: cached.expiresAt > Date.now() ? 'ready' : 'stale',
    source: cached.source || 'cache',
    stale: cached.expiresAt <= Date.now(),
    error: null,
    fetchedAt: cached.fetchedAt,
    refreshing: true,
  };
}

export default function DashboardDataProvider({ children }) {
  const [state, setState] = useState(initialState);
  const requestRef = useRef(0);
  const abortRef = useRef(null);
  const refreshTimerRef = useRef(null);
  const apiEnabled = isDashboardOverviewApiEnabled();

  const load = useCallback(async ({ force = false, background = false } = {}) => {
    const requestId = ++requestRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((current) => ({
      ...current,
      status: current.data ? current.status : 'loading',
      refreshing: background || Boolean(current.data),
      error: background ? current.error : null,
    }));

    try {
      const result = await getDashboardOverview({ signal: controller.signal, force });
      if (requestRef.current !== requestId) return;
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      setState({
        data: result.data,
        status: offline ? 'offline' : result.stale ? 'stale' : 'ready',
        source: result.source,
        stale: Boolean(result.stale),
        error: result.error || null,
        fetchedAt: result.fetchedAt || Date.now(),
        refreshing: false,
      });
    } catch (error) {
      if (error?.name === 'AbortError' || requestRef.current !== requestId) return;
      setState((current) => ({
        ...current,
        status: current.data ? 'stale' : 'error',
        stale: Boolean(current.data),
        error,
        refreshing: false,
      }));
    }
  }, []);

  const refresh = useCallback(() => load({ force: true }), [load]);

  const scheduleBackgroundRefresh = useCallback(() => {
    window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(() => load({ force: true, background: true }), REVALIDATE_DELAY);
  }, [load]);

  useEffect(() => {
    load({ background: Boolean(state.data) });
    return () => {
      abortRef.current?.abort();
      window.clearTimeout(refreshTimerRef.current);
    };
    // Initial load only. Revalidation is event-driven below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const refreshEvents = [REVIEWS_CHANGED_EVENT, TASKS_CHANGED_EVENT, REPORTS_CHANGED_EVENT, INTEGRATIONS_CHANGED_EVENT, PROFILE_CHANGED_EVENT, SECURITY_PREFERENCES_CHANGED_EVENT, SUBSCRIPTION_CHANGED_EVENT];
    refreshEvents.forEach((name) => window.addEventListener(name, scheduleBackgroundRefresh));

    const handleOnline = () => load({ force: true, background: true });
    const handleOffline = () => setState((current) => ({ ...current, status: current.data ? 'offline' : 'error', stale: Boolean(current.data) }));
    const handleStorage = (event) => {
      if (!event.key) return;

      // Overview cache changes are already the result of a fetch. Re-fetching
      // from another tab here would make the tabs bounce requests forever.
      if (event.key.startsWith(DASHBOARD_OVERVIEW_CACHE_KEY)) {
        const cached = readDashboardOverviewCache();
        if (cached?.data) {
          setState((current) => ({
            ...current,
            data: cached.data,
            source: cached.source || 'cache',
            stale: cached.expiresAt <= Date.now(),
            status: cached.expiresAt <= Date.now() ? 'stale' : 'ready',
            fetchedAt: cached.fetchedAt || current.fetchedAt,
            error: null,
          }));
        }
        return;
      }

      const relevantPrefixes = [
        'business-shield:reviews',
        'business-shield:tasks:',
        'business-shield:reports:',
        'business-shield:integrations:',
        'business-shield:profile:',
        'business-shield:security:',
        'business-shield:pin-preferences:',
        'business_shield_subscription_state_v1',
      ];
      if (relevantPrefixes.some((prefix) => event.key.startsWith(prefix))
        || event.key === 'organization'
        || event.key === 'business-shield:company-membership:v1') {
        scheduleBackgroundRefresh();
      }
    };
    const handleCacheChanged = (event) => {
      if (!event.detail?.data) return;
      setState((current) => current.source === 'api' ? current : {
        ...current,
        data: event.detail.data,
        fetchedAt: event.detail.fetchedAt || current.fetchedAt,
      });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('storage', handleStorage);
    window.addEventListener(DASHBOARD_OVERVIEW_CHANGED_EVENT, handleCacheChanged);

    return () => {
      refreshEvents.forEach((name) => window.removeEventListener(name, scheduleBackgroundRefresh));
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(DASHBOARD_OVERVIEW_CHANGED_EVENT, handleCacheChanged);
    };
  }, [load, scheduleBackgroundRefresh]);

  useEffect(() => {
    if (!apiEnabled) return undefined;
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        load({ force: true, background: true });
      }
    }, 60000);

    const handleVisibility = () => {
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
      if (!state.fetchedAt || Date.now() - state.fetchedAt > 60000) load({ force: true, background: true });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [apiEnabled, load, state.fetchedAt]);

  const value = useMemo(() => ({ ...state, apiEnabled, refresh }), [apiEnabled, refresh, state]);
  return <DashboardDataContext.Provider value={value}>{children}</DashboardDataContext.Provider>;
}
