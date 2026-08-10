import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, joinEndpoint } from '../core/apiClient';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

const request = (path, options = {}) => apiRequest(joinEndpoint(API_BASE, path), {
  ...options,
  timeout: 8000,
});

export const organizationContextService = {
  async list({ signal } = {}) {
    const payload = await request('/organizations', { signal });
    return {
      organizations: Array.isArray(payload?.organizations) ? payload.organizations : [],
      activeOrganizationId: payload?.activeOrganizationId || null,
    };
  },

  async select(organizationId) {
    const safeId = String(organizationId || '').trim();
    if (!safeId) throw new TypeError('Не выбрана организация');
    const payload = await request(`/organizations/${encodeURIComponent(safeId)}/select`, {
      method: 'POST',
    });
    if (!payload?.user?.membership) throw new Error('Сервер не вернул активное рабочее пространство');
    return payload.user;
  },
};

