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

  const skipNextRemoteSave = useRef(true);
  const saveTimer = useRef(null);
  const statusTimer = useRef(null);
  const requestVersion = useRef(0);
  const layoutRef = useRef(layout);

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

      setLayout(normalizeDashboardLayout(result.layout));
      setSyncSource(result.source);
      skipNextRemoteSave.current = true;
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

    // Local cache is written immediately so a quick tab close cannot lose a drag/resize change.
    const cached = cacheDashboardLayout(layout);
    if (!cached.stored && !apiEnabled) {
      setSaveState('error');
    }

    if (skipNextRemoteSave.current) {
      skipNextRemoteSave.current = false;
      return undefined;
    }

    window.clearTimeout(saveTimer.current);
    setSaveState('saving');

    const currentRequestVersion = ++requestVersion.current;

    saveTimer.current = window.setTimeout(async () => {
      const result = await saveDashboardLayout(layout);

      if (currentRequestVersion !== requestVersion.current) return;

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
    setLayout((current) => {
      const order = moveItem(current.order, sourceId, targetId);
      if (order === current.order) return current;

      return {
        ...current,
        order,
      };
    });
  }, []);

  const moveWidget = useCallback((widgetId, offset) => {
    setLayout((current) => {
      const order = moveItemByOffset(current.order, widgetId, offset);
      if (order === current.order) return current;

      return {
        ...current,
        order,
      };
    });
  }, []);

  const setWidgetVisibility = useCallback((widgetId, visible) => {
    if (!WIDGET_REGISTRY[widgetId]) return;

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
  }, []);

  const setDensity = useCallback((density) => {
    if (!Object.values(DASHBOARD_DENSITIES).includes(density)) return;

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
  }, []);

  const resetWidgetSize = useCallback((widgetId) => {
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
  }, []);

  const resizeWidget = useCallback((widgetId, nextSize) => {
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
  }, []);

  const resetLayout = useCallback(async () => {
    clearTimers();
    ++requestVersion.current;

    const result = await resetDashboardLayout();
    skipNextRemoteSave.current = true;
    setLayout(normalizeDashboardLayout(result.layout));
    setSyncSource(
      result.sync === 'remote'
        ? 'remote'
        : result.sync === 'local-fallback'
          ? 'local-fallback'
          : 'local'
    );
    settleSaveState(statusFromSync(result.sync));
  }, [clearTimers, settleSaveState]);

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
