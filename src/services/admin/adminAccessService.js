import { apiRequest } from '../core/apiClient';

const ADMIN_ACCESS_ENDPOINT = '/api/v1/admin/access';

export async function checkPlatformAdminAccess({ signal } = {}) {
  const result = await apiRequest(ADMIN_ACCESS_ENDPOINT, {
    signal,
    timeout: 8000,
    retries: 0,
  });

  return Boolean(result?.allowed);
}

export const adminAccessService = {
  check: checkPlatformAdminAccess,
};
