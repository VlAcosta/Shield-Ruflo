import { getRuntimeEnv } from '../core/runtimeEnv';
import { getAccountScope, getCompanyScope, readScopedJson, removeScopedValue, writeScopedJson } from '../core/dataScope';
import { apiRequest, joinEndpoint } from '../core/apiClient';
import {
  ONBOARDING_COMPLETED_KEY,
  ONBOARDING_DRAFT_KEY,
  PIN_CODE_KEY,
  PIN_UNLOCK_KEY,
  createDefaultOnboardingDraft,
} from '../../features/onboarding/model/onboardingData';
import { syncProfileCompanyFromOnboarding } from '../profile/profileService';
import {
  integrationsFromOnboardingState,
  saveConnectedIntegrations,
} from '../integrations/integrationService';
import { saveSecurityPreferences } from '../security/securityPreferencesService';

const API_BASE = String(getRuntimeEnv('API_BASE')).replace(/\/$/, '');
const LOOKUP_TIMEOUT = 6500;

const DEMO_COMPANIES = {
  '7701234567': {
    type: 'ul',
    title: 'ООО «ВНАЛ»',
    shortTitle: 'ООО «ВНАЛ»',
    inn: '7701234567',
    kpp: '770101001',
    ogrn: '1027700123456',
    address: 'г. Москва',
    status: 'Действующая организация',
    registrationDate: '17.08.2025',
  },
  '772345678012': {
    type: 'ip',
    title: 'ИП Косилов А. В.',
    shortTitle: 'ИП Косилов А. В.',
    inn: '772345678012',
    kpp: '',
    ogrn: '325770000123456',
    address: 'г. Москва',
    status: 'Действующий ИП',
    registrationDate: '01.11.2025',
  },
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}


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

  if (API_BASE) {
    const payload = await apiRequest(joinEndpoint(API_BASE, '/company/lookup'), {
      method: 'POST',
      body: { inn: normalizedInn },
      timeout: LOOKUP_TIMEOUT,
    });

    const company = payload?.company || payload;
    if (!company?.inn) throw new Error('Организация с таким ИНН не найдена');

    return {
      company,
      source: payload.source || 'ФНС / ЕГРЮЛ',
      demo: false,
    };
  }

  await wait(520);
  const demoCompany = DEMO_COMPANIES[normalizedInn];
  if (!demoCompany) {
    throw new Error('В демо-режиме используйте ИНН 7701234567 или 772345678012');
  }

  return {
    company: demoCompany,
    source: 'Демо-данные — подключите VITE_API_BASE для реального поиска',
    demo: true,
  };
}


export async function applyOnboardingConfiguration({ draft, pin }) {
  if (typeof window === 'undefined') return null;

  const organization = {
    ...(draft?.organization || {}),
    confirmed: true,
  };
  const integrations = integrationsFromOnboardingState(draft?.integrations || {});
  const security = saveSecurityPreferences(draft?.security || {});

  // syncProfileCompanyFromOnboarding writes the local profile snapshot synchronously
  // before an optional remote request, so the user can enter the cabinet immediately.
  void syncProfileCompanyFromOnboarding(organization);
  saveConnectedIntegrations(integrations);

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
    integrations: integrations.map((item) => item.id),
    security,
  };

  writeScopedJson('business-shield:onboarding:configuration:v1', configuration, { scope: getCompanyScope() });

  window.dispatchEvent(new CustomEvent('business-shield:onboarding-completed', {
    detail: configuration,
  }));

  return configuration;
}
