/**
 * Build-tool neutral runtime configuration for the current CRA/webpack codebase.
 *
 * Public values may come from:
 * 1) REACT_APP_* build variables (Create React App)
 * 2) window.__BUSINESS_SHIELD_ENV__ injected by the hosting layer at runtime
 *
 * Server secrets must never be exposed through this helper.
 */
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

  return fallback;
}

export function getRuntimeMode() {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) return String(process.env.NODE_ENV).toLowerCase();
  return 'development';
}
