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

export default function useDashboardLayout() {
  const [layout, setLayout] = useState(createDefaultDashboardLayout);
  const [isHydrated, setIsHydrated] = useState(false);
  const [saveState, setSaveState] = useState('idle');
  const [syncSource, setSyncSource] = useState('loading');

  const saveTimer = useRef(null);
  const statusTimer = useRef(null);
  const requestVersion = useRef(0);
  const layoutRef = useRef(layout);
  const lastPersistedLayout = useRef(null);

  const apiEnabled = hasDashboardLayoutApi();

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  const clearTimers = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    window.clearTimeout(statusTimer.current);
  }, []);

  const settleSaveState = useCallback((nextState) => {
    window.clearTimeout(statusTimer.current);
    setSaveState(nextState);

    if (nextState === 'saved' || nextState === 'local') {
      statusTimer.current = window.setTimeout(() => {
        setSaveState('idle');
      }, STATUS_RESET_DELAY);
    }
  }, []);

  useEffect(() => {
    let active = true;

    getDashboardLayout().then((result) => {
      if (!active) return;

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
      clearTimers();
    };
  }, [clearTimers]);

  useEffect(() => {
    if (!isHydrated) return undefined;

    const serializedLayout = serializeLayout(layout);

    // Local cache is written immediately so a quick tab close cannot lose a drag/resize change.
    const cached = cacheDashboardLayout(layout);
    if (!cached.stored && !apiEnabled) {
      setSaveState('error');
    }

    // A freshly hydrated or already persisted layout must not produce a redundant PUT.
    // Any real user change has a different serialized value and therefore always syncs.
    if (lastPersistedLayout.current === serializedLayout) {
      return undefined;
    }

    window.clearTimeout(saveTimer.current);
    setSaveState('saving');

    const currentRequestVersion = ++requestVersion.current;

    saveTimer.current = window.setTimeout(async () => {
      const result = await saveDashboardLayout(layout);

      if (currentRequestVersion !== requestVersion.current) return;

      if (result.sync === 'remote' || result.sync === 'local') {
        lastPersistedLayout.current = serializedLayout;
      }

      setSyncSource(
        result.sync === 'remote'
          ? 'remote'
          : result.sync === 'local-fallback'
            ? 'local-fallback'
            : 'local'
      );
      settleSaveState(statusFromSync(result.sync));
    }, SAVE_DELAY);

    return () => window.clearTimeout(saveTimer.current);
  }, [apiEnabled, isHydrated, layout, settleSaveState]);

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

    const currentRequestVersion = ++requestVersion.current;
    setSaveState('saving');

    const result = await saveDashboardLayout(layoutRef.current);
    if (currentRequestVersion !== requestVersion.current) return;

    if (result.sync === 'remote' || result.sync === 'local') {
      lastPersistedLayout.current = serializeLayout(layoutRef.current);
    }

    setSyncSource(
      result.sync === 'remote'
        ? 'remote'
        : result.sync === 'local-fallback'
          ? 'local-fallback'
          : 'local'
    );
    settleSaveState(statusFromSync(result.sync));
  }, [isHydrated, settleSaveState]);

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
    setLayout((current) => {
      const order = moveItem(current.order, sourceId, targetId);
      if (order === current.order) return current;

      return {
        ...current,
        order,
      };
    });
  }, [isHydrated]);

  const moveWidget = useCallback((widgetId, offset) => {
    if (!isHydrated) return;
    setLayout((current) => {
      const order = moveItemByOffset(current.order, widgetId, offset);
      if (order === current.order) return current;

      return {
        ...current,
        order,
      };
    });
  }, [isHydrated]);

  const setWidgetVisibility = useCallback((widgetId, visible) => {
    if (!isHydrated || !WIDGET_REGISTRY[widgetId]) return;

    setLayout((current) => ({
      ...current,
      widgets: {
        ...current.widgets,
        [widgetId]: {
          ...current.widgets[widgetId],
          visible,
        },
      },
    }));
  }, [isHydrated]);

  const setDensity = useCallback((density) => {
    if (!isHydrated || !Object.values(DASHBOARD_DENSITIES).includes(density)) return;

    setLayout((current) => {
      if (current.preferences?.density === density) return current;

      return {
        ...current,
        preferences: {
          ...current.preferences,
          density,
        },
      };
    });
  }, [isHydrated]);

  const resetWidgetSize = useCallback((widgetId) => {
    if (!isHydrated) return;
    const meta = WIDGET_REGISTRY[widgetId];
    if (!meta) return;

    setLayout((current) => {
      const currentSpan = current.widgets[widgetId]?.span ?? meta.defaultSpan;
      if (currentSpan === meta.defaultSpan) return current;

      return {
        ...current,
        widgets: {
          ...current.widgets,
          [widgetId]: {
            ...current.widgets[widgetId],
            span: meta.defaultSpan,
          },
        },
      };
    });
  }, [isHydrated]);

  const resizeWidget = useCallback((widgetId, nextSize) => {
    if (!isHydrated) return;
    const meta = WIDGET_REGISTRY[widgetId];
    if (!meta) return;

    setLayout((current) => {
      const currentSpan = current.widgets[widgetId]?.span ?? meta.defaultSpan;

      let requestedSpan;
      if (typeof nextSize === 'number' && Number.isFinite(nextSize)) {
        requestedSpan = nextSize;
      } else {
        const delta = nextSize === 'grow' ? 1 : -1;
        requestedSpan = currentSpan + delta;
      }

      const span = Math.min(
        meta.maxSpan,
        Math.max(meta.minSpan, Math.round(requestedSpan))
      );

      if (span === currentSpan) return current;

      return {
        ...current,
        widgets: {
          ...current.widgets,
          [widgetId]: {
            ...current.widgets[widgetId],
            span,
          },
        },
      };
    });
  }, [isHydrated]);

  const resetLayout = useCallback(async () => {
    if (!isHydrated) return;
    clearTimers();
    ++requestVersion.current;

    const result = await resetDashboardLayout();
    const normalizedLayout = normalizeDashboardLayout(result.layout);
    layoutRef.current = normalizedLayout;
    lastPersistedLayout.current = serializeLayout(normalizedLayout);
    setLayout(normalizedLayout);
    setSyncSource(
      result.sync === 'remote'
        ? 'remote'
        : result.sync === 'local-fallback'
          ? 'local-fallback'
          : 'local'
    );
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
