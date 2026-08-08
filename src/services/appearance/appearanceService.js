import { getAccountScope, readScopedJson, writeScopedJson } from '../core/dataScope';

export const APPEARANCE_STORAGE_KEY = 'business-shield:appearance:v1';
export const APPEARANCE_EVENT = 'business-shield:appearance-changed';
export const LEGACY_DASHBOARD_THEME_KEY = 'business-shield:dashboard-theme:v1';

export const APPEARANCE_MODES = Object.freeze({
  light: 'light',
  dark: 'dark',
  system: 'system',
});

function normalizeMode(value) {
  if (value === APPEARANCE_MODES.dark) return APPEARANCE_MODES.dark;
  if (value === APPEARANCE_MODES.system) return APPEARANCE_MODES.system;
  return APPEARANCE_MODES.light;
}

export function getSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return APPEARANCE_MODES.light;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? APPEARANCE_MODES.dark : APPEARANCE_MODES.light;
}

export function resolveAppearanceTheme(mode) {
  const normalized = normalizeMode(mode);
  return normalized === APPEARANCE_MODES.system ? getSystemTheme() : normalized;
}

export function getAppearanceMode() {
  const scope = getAccountScope();
  const stored = readScopedJson(APPEARANCE_STORAGE_KEY, {
    scope,
    legacy: true,
    fallback: null,
  });

  if (stored) {
    return normalizeMode(typeof stored === 'object' ? stored.mode : stored);
  }

  // One-time soft migration from the former Dashboard-only preference.
  const legacyDashboard = readScopedJson(LEGACY_DASHBOARD_THEME_KEY, {
    scope,
    legacy: true,
    fallback: null,
  });
  if (legacyDashboard) {
    const legacyMode = normalizeMode(typeof legacyDashboard === 'object' ? legacyDashboard.theme : legacyDashboard);
    writeScopedJson(APPEARANCE_STORAGE_KEY, { mode: legacyMode, migratedFrom: 'dashboard-theme' }, { scope });
    return legacyMode;
  }

  return APPEARANCE_MODES.light;
}

export function setAppearanceMode(mode) {
  const normalized = normalizeMode(mode);
  writeScopedJson(APPEARANCE_STORAGE_KEY, { mode: normalized }, { scope: getAccountScope() });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(APPEARANCE_EVENT, {
      detail: { mode: normalized, resolvedTheme: resolveAppearanceTheme(normalized) },
    }));
  }

  return normalized;
}
