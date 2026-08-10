import { apiRequest, joinEndpoint } from '../core/apiClient';

const ADMIN_SETTINGS_ENDPOINT = '/api/v1/admin/settings';
export const ADMIN_SETTINGS_CHANGED_EVENT = 'business-shield:admin-settings-changed';

function emit(snapshot) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ADMIN_SETTINGS_CHANGED_EVENT, { detail: snapshot }));
  }
}

async function request(path = '', options = {}) {
  return apiRequest(joinEndpoint(ADMIN_SETTINGS_ENDPOINT, path), {
    ...options,
    timeout: 10000,
  });
}

export async function getAdminSettings({ signal } = {}) {
  const payload = await request('', { signal });
  if (!payload || !Array.isArray(payload.plans) || !payload.capabilities) {
    throw new Error('Сервер вернул некорректный snapshot platform settings');
  }
  return { ...payload, source: 'api' };
}

export async function updateAdminSettings(section, value) {
  const result = await request(`/${section}`, { method: 'PATCH', body: value });
  const snapshot = await getAdminSettings();
  emit(snapshot);
  return result;
}

export async function toggleAdminIntegration(integrationId, enabled) {
  const result = await request(`/integrations/${integrationId}/toggle`, {
    method: 'POST',
    body: { enabled: Boolean(enabled) },
  });
  const snapshot = await getAdminSettings();
  emit(snapshot);
  return result;
}

export async function createAdminReplyTemplate(payload) {
  const result = await request('/templates', { method: 'POST', body: payload });
  const snapshot = await getAdminSettings();
  emit(snapshot);
  return result;
}

export async function updateAdminReplyTemplate(templateId, patch) {
  const result = await request(`/templates/${templateId}`, { method: 'PATCH', body: patch });
  const snapshot = await getAdminSettings();
  emit(snapshot);
  return result;
}

export async function deleteAdminReplyTemplate(templateId) {
  await request(`/templates/${templateId}`, { method: 'DELETE' });
  const snapshot = await getAdminSettings();
  emit(snapshot);
  return snapshot;
}

export async function testAdminSmtp() {
  return request('/smtp/test', { method: 'POST' });
}

export function resetAdminSettingsCache() {
  // Platform settings are server-authoritative.
}
