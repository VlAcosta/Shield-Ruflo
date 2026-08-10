import { getRuntimeEnv } from '../core/runtimeEnv';
import { getAccountScope, getCompanyScope, readScopedJson, removeScopedValue, writeScopedJson } from '../core/dataScope';
import { apiRequest, joinEndpoint } from '../core/apiClient';
import { authService } from '../auth/authService';
import {
  ONBOARDING_COMPLETED_KEY,
  ONBOARDING_DRAFT_KEY,
  PIN_CODE_KEY,
  PIN_UNLOCK_KEY,
  createDefaultOnboardingDraft,
} from '../../features/onboarding/model/onboardingData';
import { saveSecurityPreferences } from '../security/securityPreferencesService';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');
const LOOKUP_TIMEOUT = 6500;

const request = (path, options = {}) => apiRequest(joinEndpoint(API_BASE, path), { ...options, timeout: 9000 });

export function readOnboardingDraft() {
  const fallback = createDefaultOnboardingDraft();
  const saved = readScopedJson(ONBOARDING_DRAFT_KEY, { scope: getAccountScope(), legacy: true, fallback: null });

  if (!saved || saved.version !== fallback.version) return fallback;

  return {
    ...fallback,
    ...saved,
    organization: { ...fallback.organization, ...(saved.organization || {}) },
    integrations: { ...fallback.integrations, ...(saved.integrations || {}) },
    security: { ...fallback.security, ...(saved.security || {}) },
  };
}

export function saveOnboardingDraft(draft) {
  writeScopedJson(ONBOARDING_DRAFT_KEY, draft, { scope: getAccountScope() });
}

export function clearOnboardingDraft() {
  removeScopedValue(ONBOARDING_DRAFT_KEY, { scope: getAccountScope() });
  if (typeof window !== 'undefined') {
    try { localStorage.removeItem(ONBOARDING_DRAFT_KEY); } catch { /* noop */ }
  }
}

export async function lookupOrganizationByInn(inn) {
  const normalizedInn = String(inn || '').replace(/\D/g, '');
  if (![10, 12].includes(normalizedInn.length)) {
    throw new Error('Для поиска нужен ИНН из 10 или 12 цифр');
  }

  const payload = await request('/company/lookup', { method: 'POST', body: { inn: normalizedInn }, timeout: LOOKUP_TIMEOUT });
  const company = payload?.company || payload;
  if (!company?.inn) throw new Error('Организация с таким ИНН не найдена');
  return {
    company,
    source: payload.source || 'Источник не указан',
    lookupEvidence: payload.lookupEvidence || '',
    demo: Boolean(payload.demo),
  };
}

export async function loadOnboardingState({ signal } = {}) {
  const payload = await request('/onboarding/state', { signal });
  const onboarding = payload?.onboarding;
  if (!onboarding) throw new Error('Сервер не вернул состояние настройки');
  const fallback = createDefaultOnboardingDraft();
  const saved = onboarding.onboardingDraft;
  const draft = saved?.version === fallback.version ? {
    ...fallback, ...saved,
    organization: { ...fallback.organization, ...(saved.organization || {}) },
    integrations: { ...fallback.integrations, ...(saved.integrations || {}) },
    security: { ...fallback.security, ...(saved.security || {}) },
    step: onboarding.onboardingStep ?? saved.step ?? 0,
  } : { ...fallback, step: onboarding.onboardingStep ?? 0 };
  saveOnboardingDraft(draft);
  return { onboarding, draft };
}

export async function startOnboarding() {
  return request('/onboarding/start', { method: 'POST' });
}

export async function saveOnboardingState(draft) {
  const step = Math.max(0, Math.min(2, Number(draft.step) || 0));
  const payload = await request('/onboarding/state', { method: 'PATCH', body: { step, draft: { ...draft, step } } });
  saveOnboardingDraft({ ...draft, step });
  return payload;
}

export async function applyOnboardingConfiguration({ draft, pin }) {
  const organization = { ...(draft?.organization || {}), confirmed: true };
  const integrations = Object.entries(draft?.integrations || {}).filter(([, item]) => item?.enabled).map(([id]) => id);
  const result = await request('/onboarding/complete', {
    method: 'POST',
    body: { organization, integrations, locations: [] },
    timeout: 12000,
  });
  if (!result?.ok || !result?.user) throw new Error('Сервер не подтвердил завершение настройки');
  authService.persistSession({ user: result.user });
  if (typeof window === 'undefined') return result;
  const security = saveSecurityPreferences(draft?.security || {});

  localStorage.setItem(PIN_CODE_KEY, String(pin || ''));
  localStorage.setItem(PIN_UNLOCK_KEY, '1');
  localStorage.setItem(ONBOARDING_COMPLETED_KEY, '1');
  removeScopedValue('business-shield:dashboard:first-run:v1', { scope: getAccountScope() });
  // Clear the pre-A20 global first-run flag as well; otherwise a scoped reader
  // could legitimately migrate it back into a newly configured account.
  localStorage.removeItem('business-shield:dashboard:first-run:v1');
  localStorage.removeItem('dashboardBlocks');

  const configuration = {
    version: 1,
    completedAt: new Date().toISOString(),
    organization: {
      title: organization.title,
      inn: organization.inn,
      verified: Boolean(organization.confirmed),
    },
    integrations,
    security,
  };

  writeScopedJson('business-shield:onboarding:configuration:v1', configuration, { scope: getCompanyScope() });

  window.dispatchEvent(new CustomEvent('business-shield:onboarding-completed', {
    detail: configuration,
  }));

  return { ...result, configuration };
}
