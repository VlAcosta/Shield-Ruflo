import { getAccountScope, readScopedJson, writeScopedJson } from '../core/dataScope';

export const PIN_PREFERENCES_KEY = 'business-shield:pin-preferences:v1';
export const SECURITY_PREFERENCES_CHANGED_EVENT = 'business-shield:security-preferences-changed';
export const DEFAULT_SECURITY_PREFERENCES = Object.freeze({ autoLock: true, sessionMinutes: 15 });

function normalize(value = {}) {
  const minutes = Number(value.sessionMinutes);
  return {
    autoLock: value.autoLock !== false,
    sessionMinutes: [5, 15, 30, 60].includes(minutes) ? minutes : DEFAULT_SECURITY_PREFERENCES.sessionMinutes,
  };
}

export function readSecurityPreferences() {
  const value = readScopedJson(PIN_PREFERENCES_KEY, { scope: getAccountScope(), legacy: true, fallback: DEFAULT_SECURITY_PREFERENCES });
  return normalize(value || DEFAULT_SECURITY_PREFERENCES);
}

export function saveSecurityPreferences(value) {
  const normalized = normalize(value);
  writeScopedJson(PIN_PREFERENCES_KEY, normalized, { scope: getAccountScope() });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SECURITY_PREFERENCES_CHANGED_EVENT, { detail: { preferences: normalized } }));
  return normalized;
}
