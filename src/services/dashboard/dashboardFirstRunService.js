import {
  readConnectedIntegrations,
  saveConnectedIntegrations,
} from '../integrations/integrationService';
import { readSecurityPreferences } from '../security/securityPreferencesService';
import { getAccountScope, getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';

export const DASHBOARD_FIRST_RUN_KEY = 'business-shield:dashboard:first-run:v1';
export const DASHBOARD_FIRST_RUN_CHANGED_EVENT = 'business-shield:dashboard:first-run-changed';
export const ONBOARDING_CONFIGURATION_KEY = 'business-shield:onboarding:configuration:v1';

const FIRST_RUN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;


function readStoredState() {
  if (typeof window === 'undefined') {
    return {
      version: 1,
      dismissed: false,
      workspaceOpened: false,
      updatedAt: null,
    };
  }

  const raw = readScopedJson(DASHBOARD_FIRST_RUN_KEY, { scope: getAccountScope(), legacy: true, fallback: {} });
  return {
    version: 1,
    dismissed: Boolean(raw?.dismissed),
    workspaceOpened: Boolean(raw?.workspaceOpened),
    updatedAt: raw?.updatedAt || null,
  };
}

function writeStoredState(patch = {}) {
  const next = {
    ...readStoredState(),
    ...patch,
    version: 1,
    updatedAt: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    writeScopedJson(DASHBOARD_FIRST_RUN_KEY, next, { scope: getAccountScope() });

    window.dispatchEvent(new CustomEvent(DASHBOARD_FIRST_RUN_CHANGED_EVENT, {
      detail: { state: next },
    }));
  }

  return next;
}

function readOnboardingConfiguration() {
  if (typeof window === 'undefined') return null;
  return readScopedJson(ONBOARDING_CONFIGURATION_KEY, { scope: getCompanyScope(), legacy: true, fallback: null });
}

function isFreshConfiguration(configuration) {
  if (!configuration?.completedAt) return false;
  const completedAt = new Date(configuration.completedAt).getTime();
  if (!Number.isFinite(completedAt)) return false;
  return Date.now() - completedAt <= FIRST_RUN_WINDOW_MS;
}

export function readDashboardFirstRunSnapshot() {
  const configuration = readOnboardingConfiguration();
  const state = readStoredState();
  const integrations = readConnectedIntegrations();
  const security = readSecurityPreferences();
  const hasPin = typeof window !== 'undefined' && Boolean(localStorage.getItem('portal_pin_code'));

  const companyReady = Boolean(configuration?.organization?.verified);
  const integrationsReady = integrations.length > 0;
  const securityReady = hasPin && Boolean(security);
  const sourceReady = integrations.some((item) => Boolean(item.link));
  const workspaceReady = state.workspaceOpened;

  const milestones = [
    companyReady,
    integrationsReady,
    securityReady,
    sourceReady,
    workspaceReady,
  ];

  const completedCount = milestones.filter(Boolean).length;
  const active = Boolean(configuration)
    && isFreshConfiguration(configuration)
    && !state.dismissed;

  return {
    active,
    configuration,
    state,
    integrations,
    security,
    sourceReady,
    workspaceReady,
    completedCount,
    totalCount: milestones.length,
    progress: Math.round((completedCount / milestones.length) * 100),
    complete: completedCount === milestones.length,
    milestones: {
      companyReady,
      integrationsReady,
      securityReady,
      sourceReady,
      workspaceReady,
    },
  };
}

export function markDashboardWorkspaceOpened() {
  writeStoredState({ workspaceOpened: true });
  return readDashboardFirstRunSnapshot();
}

export function dismissDashboardFirstRun() {
  writeStoredState({ dismissed: true });
  return readDashboardFirstRunSnapshot();
}

export function saveDashboardSourceLink(integrationId, link) {
  const normalizedLink = String(link || '').trim();
  if (!integrationId || !normalizedLink) {
    throw new Error('Выберите площадку и добавьте ссылку');
  }

  const current = readConnectedIntegrations();
  const found = current.some((item) => item.id === integrationId);
  if (!found) {
    throw new Error('Площадка больше не подключена');
  }

  saveConnectedIntegrations(current.map((item) => (
    item.id === integrationId
      ? { ...item, link: normalizedLink }
      : item
  )));

  window.dispatchEvent(new CustomEvent(DASHBOARD_FIRST_RUN_CHANGED_EVENT));
  return readDashboardFirstRunSnapshot();
}
