/**
 * Build-tool neutral runtime configuration for the current CRA/webpack codebase.
 *
 * Public values may come from:
 * 1) REACT_APP_* build variables (Create React App)
 * 2) window.__BUSINESS_SHIELD_ENV__ injected by the hosting layer at runtime
 * 3) safe same-origin Business Shield API defaults
 *
 * Server secrets must never be exposed through this helper.
 */
const SAFE_DEFAULTS = Object.freeze({
  DASHBOARD_OVERVIEW_ENDPOINT: '/api/v1/dashboard/overview',
  TASKS_ENDPOINT: '/api/v1/tasks',
  INTEGRATIONS_ENDPOINT: '/api/v1/integrations',
  AUTOMATIONS_ENDPOINT: '/api/v1/automations',
  REPORTS_ENDPOINT: '/api/v1/reports',
  NOTIFICATIONS_ENDPOINT: '/api/v1/notifications',
  SUBSCRIPTIONS_ENDPOINT: '/api/v1/billing/subscription',
});

export function getRuntimeEnv(name, fallback = '') {
  const rawName = String(name || '').trim();
  const normalized = rawName
    .replace(/^VITE_/, '')
    .replace(/^REACT_APP_/, '');
  const craName = `REACT_APP_${normalized}`;

  if (typeof window !== 'undefined') {
    const runtime = window.__BUSINESS_SHIELD_ENV__;
    if (runtime && Object.prototype.hasOwnProperty.call(runtime, rawName)) return runtime[rawName];
    if (runtime && Object.prototype.hasOwnProperty.call(runtime, normalized)) return runtime[normalized];
    if (runtime && Object.prototype.hasOwnProperty.call(runtime, craName)) return runtime[craName];
  }

  if (typeof process !== 'undefined' && process.env) {
    if (process.env[craName] !== undefined) return process.env[craName];
    if (process.env[rawName] !== undefined) return process.env[rawName];
  }

  if (Object.prototype.hasOwnProperty.call(SAFE_DEFAULTS, normalized)) {
    return SAFE_DEFAULTS[normalized];
  }

  return fallback;
}

export function getRuntimeMode() {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) return String(process.env.NODE_ENV).toLowerCase();
  return 'development';
}
