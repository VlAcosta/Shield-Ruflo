import { businessLocationsService } from './businessLocationsService';

const response = (body) => Promise.resolve({ ok: true, status: 200, url: '/api/v1/test', headers: { get: () => 'application/json' }, json: () => Promise.resolve(body) });

describe('businessLocationsService', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('currentUser', JSON.stringify({ membership: { organizationId: 'org-a' } }));
    global.fetch = jest.fn(() => response({ businesses: [] }));
  });

  test('lists businesses only under the active organization path', async () => {
    await expect(businessLocationsService.list()).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledWith('/api/v1/organizations/org-a/businesses', expect.objectContaining({ credentials: 'include' }));
  });

  test('uses resource paths for primary changes', async () => {
    await businessLocationsService.updateLocation('loc-1', { is_primary: true });
    expect(fetch).toHaveBeenCalledWith('/api/v1/locations/loc-1', expect.objectContaining({ method: 'PATCH', body: '{"is_primary":true}' }));
  });
});
