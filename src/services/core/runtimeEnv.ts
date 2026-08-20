export type PublicRuntimeValue = string | number | boolean | null | undefined;
export type BusinessShieldRuntimeEnv = Record<string, PublicRuntimeValue>;

declare global {
  interface Window {
    __BUSINESS_SHIELD_ENV__?: BusinessShieldRuntimeEnv;
  }
}

const SAFE_DEFAULTS: Readonly<Record<string, string>> = Object.freeze({
  API_BASE: '/api/v1',
  DASHBOARD_OVERVIEW_ENDPOINT: '/api/v1/dashboard/overview',
  TASKS_ENDPOINT: '/api/v1/tasks',
  CALENDAR_ENDPOINT: '/api/v1/calendar/events',
  INTEGRATIONS_ENDPOINT: '/api/v1/integrations',
  AUTOMATIONS_ENDPOINT: '/api/v1/automations',
  REPORTS_ENDPOINT: '/api/v1/reports',
  NOTIFICATIONS_ENDPOINT: '/api/v1/notifications',
  SUBSCRIPTIONS_ENDPOINT: '/api/v1/billing/subscription',
});

function normalizeName(name: string): string {
  return String(name || '').trim().replace(/^VITE_/, '').replace(/^REACT_APP_/, '');
}

function normalizeValue(value: PublicRuntimeValue): string | undefined {
  if (value === undefined || value === null) return undefined;
  return String(value);
}

export function getRuntimeEnv(name: string, fallback = ''): string {
  const rawName = String(name || '').trim();
  const normalized = normalizeName(rawName);
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
