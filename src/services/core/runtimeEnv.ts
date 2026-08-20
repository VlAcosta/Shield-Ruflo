export type PublicRuntimeValue = string | number | boolean | null | undefined;
export type BusinessShieldRuntimeEnv = Record<string, PublicRuntimeValue>;

declare global {
  interface Window {
    __BUSINESS_SHIELD_ENV__?: BusinessShieldRuntimeEnv;
  }
}

const SAFE_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  API_BASE: '/api/v1',
});

const API_RELATIVE_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  DASHBOARD_OVERVIEW_ENDPOINT: '/dashboard/overview',
  DASHBOARD_LAYOUT_ENDPOINT: '/dashboard/layout',
  TASKS_ENDPOINT: '/tasks',
  CALENDAR_ENDPOINT: '/calendar/events',
  INTEGRATIONS_ENDPOINT: '/integrations',
  AUTOMATIONS_ENDPOINT: '/automations',
  REPORTS_ENDPOINT: '/reports',
  NOTIFICATIONS_ENDPOINT: '/notifications',
  SUBSCRIPTIONS_ENDPOINT: '/billing/subscription',
});

function normalizeName(name: string): string {
  return String(name || '').trim().replace(/^VITE_/, '').replace(/^REACT_APP_/, '');
}

function normalizeValue(value: PublicRuntimeValue): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

function joinEndpoint(base: string, path: string): string {
  const normalizedBase = String(base || '').replace(/\/$/, '');
  const normalizedPath = String(path || '').startsWith('/') ? String(path || '') : `/${String(path || '')}`;
  return `${normalizedBase}${normalizedPath}`;
}

function readExplicitRuntimeValue(rawName: string, normalized: string): string | undefined {
  const viteName = `VITE_${normalized}`;
  const legacyName = `REACT_APP_${normalized}`;

  if (typeof window !== 'undefined') {
    const runtime = window.__BUSINESS_SHIELD_ENV__;
    if (runtime) {
      for (const key of [rawName, normalized, viteName, legacyName]) {
        if (!Object.prototype.hasOwnProperty.call(runtime, key)) continue;
        const value = normalizeValue(runtime[key]);
        if (value !== undefined) return value;
      }
    }
  }

  const buildEnv = import.meta.env as Record<string, string | boolean | undefined>;
  for (const key of [viteName, legacyName, rawName]) {
    const value = buildEnv[key];
    if (value !== undefined) return String(value);
  }

  return undefined;
}

export function getRuntimeEnv(name: string, fallback = ''): string {
  const rawName = String(name || '').trim();
  const normalized = normalizeName(rawName);
  const explicitValue = readExplicitRuntimeValue(rawName, normalized);
  if (explicitValue !== undefined) return explicitValue;

  if (Object.prototype.hasOwnProperty.call(API_RELATIVE_DEFAULTS, normalized)) {
    const apiBase = getRuntimeEnv('API_BASE', SAFE_DEFAULTS.API_BASE || '/api/v1');
    return joinEndpoint(apiBase, API_RELATIVE_DEFAULTS[normalized] || '');
  }

  if (Object.prototype.hasOwnProperty.call(SAFE_DEFAULTS, normalized)) {
    return SAFE_DEFAULTS[normalized] ?? fallback;
  }

  return fallback;
}

export function getRuntimeMode(): string {
  return String(import.meta.env.MODE || 'development').toLowerCase();
}

export function isProductionRuntime(): boolean {
  return getRuntimeMode() === 'production';
}
