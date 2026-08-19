import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  cacheDashboardLayout,
  getDashboardLayout,
  hasDashboardLayoutApi,
  resetDashboardLayout,
  saveDashboardLayout,
} from '../../../services/dashboard/dashboardLayoutService';
import {
  createDefaultDashboardLayout,
  normalizeDashboardLayout,
  DASHBOARD_DENSITIES,
  WIDGET_REGISTRY,
} from '../model/widgetRegistry';

const SAVE_DELAY = 520;
const STATUS_RESET_DELAY = 1800;

function serializeLayout(layout) {
  return JSON.stringify(normalizeDashboardLayout(layout));
}

function moveItem(order, sourceId, targetId) {
  if (!sourceId || !targetId || sourceId === targetId) return order;

  const sourceIndex = order.indexOf(sourceId);
  const targetIndex = order.indexOf(targetId);
  if (sourceIndex === -1 || targetIndex === -1) return order;

  const next = [...order];
  const [removed] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, removed);
  return next;
}

function moveItemByOffset(order, widgetId, offset) {
  const currentIndex = order.indexOf(widgetId);
  if (currentIndex === -1) return order;

  const targetIndex = Math.min(order.length - 1, Math.max(0, currentIndex + offset));
  if (targetIndex === currentIndex) return order;

  const next = [...order];
  const [removed] = next.splice(currentIndex, 1);
  next.splice(targetIndex, 0, removed);
  return next;
}

function statusFromSync(sync) {
  if (sync === 'remote') return 'saved';
  if (sync === 'local') return 'local';
  if (sync === 'local-fallback') return 'offline';
  return 'error';
}

function syncSourceFromResult(sync) {
  if (sync === 'remote') return 'remote';
  if (sync === 'local-fallback') return 'local-fallback';
  return 'local';
}

export default function useDashboardLayout() {
  const initialLayout = useMemo(() => createDefaultDashboardLayout(), []);
  const [layout, setLayout] = useState(initialLayout);
  const [isHydrated, setIsHydrated] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [syncSource, setSyncSource] = useState('loading');

  const saveTimer = useRef(null);
  const statusTimer = useRef(null);
  const requestVersion = useRef(0);
  const layoutRef = useRef(initialLayout);
  const lastPersistedLayout = useRef(null);
  const mountedRef = useRef(true);

  const apiEnabled = hasDashboardLayoutApi();

  const clearTimers = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.clearTimeout(saveTimer.current);
    window.clearTimeout(statusTimer.current);
  }, []);

  const settleSaveState = useCallback((nextState) => {
    if (!mountedRef.current) return;
    if (typeof window !== 'undefined') window.clearTimeout(statusTimer.current);
    setSaveState(nextState);

    if ((nextState === 'saved' || nextState === 'local') && typeof window !== 'undefined') {
      statusTimer.current = window.setTimeout(() => {
        if (mountedRef.current) setSaveState('idle');
      }, STATUS_RESET_DELAY);
    }
  }, []);

  const persistLayout = useCallback(async (targetLayout, currentRequestVersion) => {
    const targetSerialized = serializeLayout(targetLayout);
    const result = await saveDashboardLayout(targetLayout);

    if (!mountedRef.current || currentRequestVersion !== requestVersion.current) return;

    if (result.sync === 'remote' || result.sync === 'local') {
      lastPersistedLayout.current = targetSerialized;
    }

    setSyncSource(syncSourceFromResult(result.sync));
    settleSaveState(statusFromSync(result.sync));
  }, [settleSaveState]);

  const schedulePersist = useCallback((nextLayout, { immediate = false } = {}) => {
    const normalizedLayout = normalizeDashboardLayout(nextLayout);
    const serializedLayout = serializeLayout(normalizedLayout);

    layoutRef.current = normalizedLayout;
    setLayout(normalizedLayout);

    // Keep a synchronous local copy before the network write. A fast navigation
    // or tab close cannot lose the latest drag, resize or visibility change.
    const cached = cacheDashboardLayout(normalizedLayout);
    if (!cached.stored && !apiEnabled) {
      settleSaveState('error');
      return;
    }

    // Do not emit a redundant network write if the user action normalizes back
    // to the exact server-confirmed layout.
    if (lastPersistedLayout.current === serializedLayout) {
      settleSaveState(apiEnabled ? 'saved' : cached.stored ? 'local' : 'error');
      return;
    }

    if (typeof window === 'undefined') return;
    window.clearTimeout(saveTimer.current);
    setSaveState('saving');
    const currentRequestVersion = ++requestVersion.current;

    if (immediate) {
      void persistLayout(normalizedLayout, currentRequestVersion);
      return;
    }

    saveTimer.current = window.setTimeout(() => {
      void persistLayout(layoutRef.current, currentRequestVersion);
    }, SAVE_DELAY);
  }, [apiEnabled, persistLayout, settleSaveState]);

  useEffect(() => {
    mountedRef.current = true;
    let active = true;

    getDashboardLayout().then((result) => {
      if (!active || !mountedRef.current) return;

      const hydratedLayout = normalizeDashboardLayout(result.layout);
      layoutRef.current = hydratedLayout;
      lastPersistedLayout.current = serializeLayout(hydratedLayout);
      setLayout(hydratedLayout);
      setSyncSource(result.source);
      setIsHydrated(true);

      if (result.source === 'local-fallback') {
        setSaveState('offline');
      }
    });

    return () => {
      active = false;
      mountedRef.current = false;
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    if (!isHydrated || typeof window === 'undefined') return undefined;

    const persistBeforeUnload = () => {
      cacheDashboardLayout(layoutRef.current);
    };

    window.addEventListener('beforeunload', persistBeforeUnload);
    return () => window.removeEventListener('beforeunload', persistBeforeUnload);
  }, [isHydrated]);

  const retrySync = useCallback(async () => {
    if (!isHydrated) return;

    if (typeof window !== 'undefined') window.clearTimeout(saveTimer.current);
    const currentRequestVersion = ++requestVersion.current;
    setSaveState('saving');
    await persistLayout(layoutRef.current, currentRequestVersion);
  }, [isHydrated, persistLayout]);

  useEffect(() => {
    if (!apiEnabled || typeof window === 'undefined') return undefined;

    const handleOnline = () => {
      retrySync();
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [apiEnabled, retrySync]);

  const reorder = useCallback((sourceId, targetId) => {
    if (!isHydrated) return;
    const current = layoutRef.current;
    const order = moveItem(current.order, sourceId, targetId);
    if (order === current.order) return;
    schedulePersist({ ...current, order });
  }, [isHydrated, schedulePersist]);

  const moveWidget = useCallback((widgetId, offset) => {
    if (!isHydrated) return;
    const current = layoutRef.current;
    const order = moveItemByOffset(current.order, widgetId, offset);
    if (order === current.order) return;
    schedulePersist({ ...current, order });
  }, [isHydrated, schedulePersist]);

  const setWidgetVisibility = useCallback((widgetId, visible) => {
    if (!isHydrated || !WIDGET_REGISTRY[widgetId]) return;
    const current = layoutRef.current;
    if (current.widgets[widgetId]?.visible === visible) return;

    schedulePersist({
      ...current,
      widgets: {
        ...current.widgets,
        [widgetId]: {
          ...current.widgets[widgetId],
          visible,
        },
      },
    }, { immediate: true });
  }, [isHydrated, schedulePersist]);

  const setDensity = useCallback((density) => {
    if (!isHydrated || !Object.values(DASHBOARD_DENSITIES).includes(density)) return;
    const current = layoutRef.current;
    if (current.preferences?.density === density) return;

    schedulePersist({
      ...current,
      preferences: {
        ...current.preferences,
        density,
      },
    }, { immediate: true });
  }, [isHydrated, schedulePersist]);

  const resetWidgetSize = useCallback((widgetId) => {
    if (!isHydrated) return;
    const meta = WIDGET_REGISTRY[widgetId];
    if (!meta) return;

    const current = layoutRef.current;
    const currentSpan = current.widgets[widgetId]?.span ?? meta.defaultSpan;
    if (currentSpan === meta.defaultSpan) return;

    schedulePersist({
      ...current,
      widgets: {
        ...current.widgets,
        [widgetId]: {
          ...current.widgets[widgetId],
          span: meta.defaultSpan,
        },
      },
    });
  }, [isHydrated, schedulePersist]);

  const resizeWidget = useCallback((widgetId, nextSize) => {
    if (!isHydrated) return;
    const meta = WIDGET_REGISTRY[widgetId];
    if (!meta) return;

    const current = layoutRef.current;
    const currentSpan = current.widgets[widgetId]?.span ?? meta.defaultSpan;
    const requestedSpan = typeof nextSize === 'number' && Number.isFinite(nextSize)
      ? nextSize
      : currentSpan + (nextSize === 'grow' ? 1 : -1);
    const span = Math.min(meta.maxSpan, Math.max(meta.minSpan, Math.round(requestedSpan)));
    if (span === currentSpan) return;

    schedulePersist({
      ...current,
      widgets: {
        ...current.widgets,
        [widgetId]: {
          ...current.widgets[widgetId],
          span,
        },
      },
    });
  }, [isHydrated, schedulePersist]);

  const resetLayout = useCallback(async () => {
    if (!isHydrated) return;
    clearTimers();
    ++requestVersion.current;

    const result = await resetDashboardLayout();
    const normalizedLayout = normalizeDashboardLayout(result.layout);
    layoutRef.current = normalizedLayout;
    lastPersistedLayout.current = serializeLayout(normalizedLayout);
    setLayout(normalizedLayout);
    setSyncSource(syncSourceFromResult(result.sync));
    settleSaveState(statusFromSync(result.sync));
  }, [clearTimers, isHydrated, settleSaveState]);

  const widgets = useMemo(() => layout.order
    .filter((id) => WIDGET_REGISTRY[id] && layout.widgets[id])
    .map((id) => ({
      id,
      meta: WIDGET_REGISTRY[id],
      config: layout.widgets[id],
    })), [layout]);

  return {
    layout,
    widgets,
    isHydrated,
    saveState,
    syncSource,
    apiEnabled,
    reorder,
    moveWidget,
    resizeWidget,
    resetLayout,
    retrySync,
    setWidgetVisibility,
    setDensity,
    resetWidgetSize,
  };
}
