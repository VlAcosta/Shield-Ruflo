import { getAccountScope, readScopedJson, writeScopedJson } from '../core/dataScope';

export const DASHBOARD_THEME_STORAGE_KEY = 'business-shield:dashboard-theme:v1';
export const DASHBOARD_THEME_EVENT = 'business-shield:dashboard-theme-changed';

export const DASHBOARD_THEMES = Object.freeze({
  light: 'light',
  dark: 'dark',
});

function normalizeTheme(value) {
  return value === DASHBOARD_THEMES.dark ? DASHBOARD_THEMES.dark : DASHBOARD_THEMES.light;
}

export function getDashboardTheme() {
  const stored = readScopedJson(DASHBOARD_THEME_STORAGE_KEY, {
    scope: getAccountScope(),
    legacy: true,
    fallback: DASHBOARD_THEMES.light,
  });

  if (stored && typeof stored === 'object') {
    return normalizeTheme(stored.theme);
  }

  return normalizeTheme(stored);
}

export function setDashboardTheme(theme) {
  const normalized = normalizeTheme(theme);
  writeScopedJson(DASHBOARD_THEME_STORAGE_KEY, { theme: normalized }, { scope: getAccountScope() });

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DASHBOARD_THEME_EVENT, {
      detail: { theme: normalized },
    }));
  }

  return normalized;
}
