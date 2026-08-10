import { apiRequest } from '../core/apiClient';
import { authService } from './authService';

vi.mock('../core/apiClient', () => ({
  apiRequest: vi.fn(),
  joinEndpoint: (base, path) => `${base}${path}`,
}));

describe('authService hardened browser contract', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    localStorage.clear();
  });

  test('registration relies on the HttpOnly cookie instead of a bearer token', async () => {
    apiRequest.mockResolvedValue({ user: { id: 'user-1' } });

    await authService.register({
      phone: '+79991234567',
      firstName: 'Anna',
      lastName: 'Petrova',
      email: 'anna@example.test',
      plan: null,
    });

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/auth/complete-profile', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
  });

  test('logout-all revokes server sessions before clearing cached identity', async () => {
    localStorage.setItem('token', 'legacy-token');
    localStorage.setItem('currentUser', JSON.stringify({ id: 'user-1' }));
    apiRequest.mockResolvedValue({ ok: true, revoked: 2 });

    await expect(authService.logoutAll()).resolves.toEqual({ ok: true, revoked: 2 });

    expect(apiRequest).toHaveBeenCalledWith('/api/v1/auth/logout-all', expect.objectContaining({ method: 'POST' }));
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('currentUser')).toBeNull();
  });

  test('persists server organization onboarding state without making the global flag authoritative', () => {
    authService.persistSession({
      user: {
        id: 'user-1',
        membership: {
          organizationId: 'org-b',
          role: 'ANALYST',
          permissions: ['dashboard.view'],
          organization: { id: 'org-b', name: 'Бета', onboardingStatus: 'IN_PROGRESS' },
        },
      },
    });

    expect(localStorage.getItem('onboarding_completed')).toBeNull();
    expect(JSON.parse(localStorage.getItem('organization'))).toMatchObject({ id: 'org-b', name: 'Бета', onboardingStatus: 'IN_PROGRESS' });
  });
});
