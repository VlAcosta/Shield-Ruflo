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
          id: 'membership-1',
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

  test('does not synthesize direct membership from delegated organization context', async () => {
    apiRequest.mockResolvedValue({
      user: {
        id: 'agency-user',
        membership: null,
      },
      organizationContext: {
        organizationId: 'client-org',
        membershipId: null,
        role: null,
        permissions: ['reviews.view', 'reviews.reply'],
        accessMode: 'DELEGATED',
        agencyOrganizationId: 'agency-org',
        delegatedGrantId: 'grant-1',
        agencyClientLinkId: 'link-1',
      },
    });

    const user = await authService.restoreSession();
    const cached = JSON.parse(localStorage.getItem('currentUser'));

    expect(user.membership).toBeNull();
    expect(cached.membership).toBeNull();
    expect(cached.organizationContext).toMatchObject({
      organizationId: 'client-org',
      accessMode: 'DELEGATED',
      delegatedGrantId: 'grant-1',
    });
  });

  test('preserves exact server permissions for a directly selected membership', () => {
    authService.persistSession({
      user: {
        id: 'agency-owner',
        membership: {
          id: 'membership-agency',
          organizationId: 'agency-org',
          role: 'OWNER',
          permissions: ['dashboard.view', 'agency.view', 'agency.manage'],
          organization: { id: 'agency-org', name: 'Agency', onboardingStatus: 'COMPLETED' },
        },
      },
    });

    const cached = JSON.parse(localStorage.getItem('currentUser'));
    expect(cached.organizationContext).toEqual(expect.objectContaining({
      organizationId: 'agency-org',
      membershipId: 'membership-agency',
      accessMode: 'DIRECT',
      permissions: ['dashboard.view', 'agency.view', 'agency.manage'],
    }));
  });
});
