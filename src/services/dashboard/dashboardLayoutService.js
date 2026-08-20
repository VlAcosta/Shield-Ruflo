import { getRuntimeEnv } from '../core/runtimeEnv';
import {
  createDefaultDashboardLayout,
  normalizeDashboardLayout,
} from '../../features/dashboard/model/widgetRegistry';
import { getAccountScope, readScopedJson, scopedStorageKey, writeScopedJson } from '../core/dataScope';
import { apiRequest as coreApiRequest } from '../core/apiClient';

export const DASHBOARD_LAYOUT_STORAGE_KEY = 'business_shield_dashboard_layout';

const LEGACY_STORAGE_KEYS = Object.freeze([
  'business_shield_dashboard_layout_v2',
]);

const API_ENDPOINT = getRuntimeEnv('DASHBOARD_LAYOUT_ENDPOINT');

function currentLayoutKey() {
  return scopedStorageKey(DASHBOARD_LAYOUT_STORAGE_KEY, getAccountScope());
}

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function parseStoredLayout(raw) {
  if (!raw) return null;

  try {
    return normalizeDashboardLayout(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readStorageKey(key) {
  if (!canUseStorage()) return null;

  try {
    return parseStoredLayout(window.localStorage.getItem(key));
  } catch (error) {
    console.warn('[dashboard-layout] Failed to read local layout', error);
    return null;
  }
}

function writeStorageKey(key, layout) {
  if (!canUseStorage()) return false;

  try {
    window.localStorage.setItem(key, JSON.stringify(layout));
    return true;
  } catch (error) {
    console.warn('[dashboard-layout] Failed to cache local layout', error);
    return false;
  }
}

function migrateLegacyLayout() {
  if (!canUseStorage()) return null;

  for (const key of LEGACY_STORAGE_KEYS) {
    const layout = readStorageKey(key);
    if (!layout) continue;

    writeStorageKey(currentLayoutKey(), layout);
    try { window.localStorage.removeItem(key); } catch { /* noop */ }
    return layout;
  }

  return null;
}

function readLocalLayout() {
  const scoped = readScopedJson(DASHBOARD_LAYOUT_STORAGE_KEY, {
    scope: getAccountScope(),
    legacy: true,
    fallback: null,
  });
  const normalized = scoped ? normalizeDashboardLayout(scoped) : null;

  return normalized
    || migrateLegacyLayout()
    || createDefaultDashboardLayout();
}

export function cacheDashboardLayout(layout) {
  const normalized = normalizeDashboardLayout(layout);
  const stored = writeScopedJson(DASHBOARD_LAYOUT_STORAGE_KEY, normalized, { scope: getAccountScope() });

  return {
    layout: normalized,
    stored,
  };
}

export function hasDashboardLayoutApi() {
  return Boolean(API_ENDPOINT);
}

async function apiRequest(options = {}) {
  if (!API_ENDPOINT) {
    throw new Error('Dashboard layout API endpoint is not configured');
  }
  return coreApiRequest(API_ENDPOINT, { ...options, timeout: 8000 });
}

async function migrateLocalLayoutToRemote(localLayout) {
  await apiRequest({
    method: 'PUT',
    body: JSON.stringify({ layout: localLayout }),
  });
  return localLayout;
}

export async function getDashboardLayout() {
  const localLayout = readLocalLayout();

  if (!API_ENDPOINT) {
    return {
      layout: localLayout,
      source: 'local',
    };
  }

  try {
    const payload = await apiRequest();
    const explicitlyEmpty = payload
      && typeof payload === 'object'
      && Object.prototype.hasOwnProperty.call(payload, 'layout')
      && payload.layout == null;

    const layout = explicitlyEmpty
      ? await migrateLocalLayoutToRemote(localLayout)
      : normalizeDashboardLayout(payload?.layout ?? payload);
    cacheDashboardLayout(layout);

    return {
      layout,
      source: 'remote',
    };
  } catch (error) {
    console.warn('[dashboard-layout] API unavailable, using local cache', error);

    return {
      layout: localLayout,
      source: 'local-fallback',
      error,
    };
  }
}

export async function saveDashboardLayout(layout) {
  const cached = cacheDashboardLayout(layout);

  if (!API_ENDPOINT) {
    return {
      ...cached,
      sync: cached.stored ? 'local' : 'local-error',
    };
  }

  try {
    await apiRequest({
      method: 'PUT',
      body: JSON.stringify({ layout: cached.layout }),
    });

    return {
      ...cached,
      sync: 'remote',
    };
  } catch (error) {
    console.warn('[dashboard-layout] Failed to sync layout with API', error);

    return {
      ...cached,
      sync: cached.stored ? 'local-fallback' : 'local-error',
      error,
    };
  }
}

export async function resetDashboardLayout() {
  const defaultLayout = createDefaultDashboardLayout();
  const cached = cacheDashboardLayout(defaultLayout);

  if (!API_ENDPOINT) {
    return {
      ...cached,
      sync: cached.stored ? 'local' : 'local-error',
    };
  }

  try {
    await apiRequest({ method: 'DELETE' });

    return {
      ...cached,
      sync: 'remote',
    };
  } catch (error) {
    console.warn('[dashboard-layout] Failed to reset layout on API', error);

    return {
      ...cached,
      sync: cached.stored ? 'local-fallback' : 'local-error',
      error,
    };
  }
}
