import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, joinEndpoint } from '../core/apiClient';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');
const request = (path, options = {}) => apiRequest(joinEndpoint(API_BASE, path), { ...options, timeout: 9000 });

function activeOrganizationId() {
  try {
    const user = JSON.parse(localStorage.getItem('currentUser') || 'null');
    const id = user?.membership?.organizationId || user?.membership?.organization?.id;
    if (id) return id;
  } catch { /* handled below */ }
  throw new Error('Активная организация не выбрана');
}

export const businessLocationsService = {
  async list({ signal } = {}) {
    const organizationId = activeOrganizationId();
    const payload = await request(`/organizations/${encodeURIComponent(organizationId)}/businesses`, { signal });
    return Array.isArray(payload?.businesses) ? payload.businesses : [];
  },
  createBusiness(body) {
    const organizationId = activeOrganizationId();
    return request(`/organizations/${encodeURIComponent(organizationId)}/businesses`, { method: 'POST', body });
  },
  updateBusiness(id, body) { return request(`/businesses/${encodeURIComponent(id)}`, { method: 'PATCH', body }); },
  archiveBusiness(id) { return request(`/businesses/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
  createLocation(businessId, body) { return request(`/businesses/${encodeURIComponent(businessId)}/locations`, { method: 'POST', body }); },
  updateLocation(id, body) { return request(`/locations/${encodeURIComponent(id)}`, { method: 'PATCH', body }); },
  archiveLocation(id) { return request(`/locations/${encodeURIComponent(id)}`, { method: 'DELETE' }); },
};
