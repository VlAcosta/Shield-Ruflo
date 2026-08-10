import { apiRequest } from '../core/apiClient';
import { organizationContextService } from './organizationContextService';

vi.mock('../core/apiClient', () => ({
  apiRequest: vi.fn(),
  joinEndpoint: (base, path) => `${base}${path}`,
}));

describe('organizationContextService', () => {
  beforeEach(() => apiRequest.mockReset());

  test('lists memberships and identifies the server-selected organization', async () => {
    apiRequest.mockResolvedValue({ organizations: [{ organization: { id: 'org-a' } }], activeOrganizationId: 'org-a' });
    await expect(organizationContextService.list()).resolves.toEqual({
      organizations: [{ organization: { id: 'org-a' } }],
      activeOrganizationId: 'org-a',
    });
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/organizations', expect.objectContaining({ timeout: 8000 }));
  });

  test('selects on the server and requires the returned active membership', async () => {
    const user = { id: 'user-1', membership: { organizationId: 'org-b', role: 'ANALYST', permissions: ['dashboard.view'] } };
    apiRequest.mockResolvedValue({ ok: true, user });
    await expect(organizationContextService.select('org-b')).resolves.toEqual(user);
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/organizations/org-b/select', expect.objectContaining({ method: 'POST' }));
  });

  test('rejects an incomplete switch response', async () => {
    apiRequest.mockResolvedValue({ ok: true });
    await expect(organizationContextService.select('org-b')).rejects.toThrow('активное рабочее пространство');
  });
});
