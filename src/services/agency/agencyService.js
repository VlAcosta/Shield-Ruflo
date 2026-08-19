import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, joinEndpoint } from '../core/apiClient';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

const request = (path, options = {}) => apiRequest(joinEndpoint(API_BASE, path), {
  ...options,
  timeout: 9000,
});

export const agencyService = {
  async listWorkspaces({ signal } = {}) {
    const payload = await request('/agency/workspaces', { signal });
    return Array.isArray(payload?.workspaces) ? payload.workspaces : [];
  },

  async selectWorkspace(organizationId) {
    const id = String(organizationId || '').trim();
    if (!id) throw new TypeError('Не выбрано рабочее пространство');
    return request(`/agency/workspaces/${encodeURIComponent(id)}/select`, { method: 'POST' });
  },

  async getPortfolio({ signal } = {}) {
    return request('/agency/portfolio', { signal });
  },

  async createInvitation(input) {
    return request('/agency/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  },

  async acceptInvitation(token) {
    const safeToken = String(token || '').trim();
    if (!safeToken) throw new TypeError('Не указан токен приглашения');
    return request(`/agency/invitations/${encodeURIComponent(safeToken)}/accept`, { method: 'POST' });
  },

  async updateClientLink(linkId, status) {
    return request(`/agency/clients/${encodeURIComponent(linkId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  },

  async revokeClientAccess(linkId) {
    return request(`/agency/client-access/${encodeURIComponent(linkId)}/revoke`, { method: 'POST' });
  },
};
