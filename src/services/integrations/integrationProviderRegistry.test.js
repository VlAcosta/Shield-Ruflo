import {
  getBackendProviderId,
  getProviderCapabilities,
  googleBusinessAccounts,
  googleBusinessLocations,
  googleBusinessOAuthStart,
  googleBusinessSelect,
  providerSync,
  providerSyncStatus,
} from './integrationProviderRegistry';
import { apiRequest } from '../core/apiClient';

vi.mock('../core/runtimeEnv', () => ({
  getRuntimeEnv: () => '/api/v1/integrations',
}));

vi.mock('../core/apiClient', () => ({
  apiRequest: vi.fn(),
  createIdempotencyKey: vi.fn((scope) => `idem:${scope}`),
  joinEndpoint: (base, path) => `${String(base).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`,
}));

describe('P17 Google Business Profile frontend provider contract', () => {
  beforeEach(() => apiRequest.mockReset());

  test('maps the legacy UI id to the production backend provider and claims only implemented review capability', () => {
    expect(getBackendProviderId('google')).toBe('google-business-profile');
    expect(getProviderCapabilities('google')).toEqual(['oauth', 'accounts.read', 'locations.read', 'profile.read', 'reviews.read']);
    expect(getProviderCapabilities('google')).not.toContain('replies.write');
  });

  test('starts OAuth on the dedicated GBP route', async () => {
    apiRequest.mockResolvedValue({ authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=test' });
    await googleBusinessOAuthStart();
    expect(apiRequest).toHaveBeenCalledWith(
      '/api/v1/integrations/providers/google-business-profile/oauth/start',
      expect.objectContaining({ method: 'POST', idempotencyKey: 'idem:google-business-oauth-start' }),
    );
  });

  test('uses dedicated account location and selection routes', async () => {
    apiRequest.mockResolvedValue({ accounts: [] });
    await googleBusinessAccounts();
    expect(apiRequest).toHaveBeenLastCalledWith(
      '/api/v1/integrations/providers/google-business-profile/accounts',
      expect.objectContaining({ retries: 0 }),
    );

    apiRequest.mockResolvedValue({ locations: [] });
    await googleBusinessLocations('accounts/abc_123');
    expect(apiRequest).toHaveBeenLastCalledWith(
      '/api/v1/integrations/providers/google-business-profile/accounts/abc_123/locations',
      expect.objectContaining({ retries: 0 }),
    );

    const selection = { googleAccountName: 'accounts/abc_123', locationNames: ['locations/location_1'] };
    apiRequest.mockResolvedValue({ integration: { status: 'CONNECTED' } });
    await googleBusinessSelect(selection);
    expect(apiRequest).toHaveBeenLastCalledWith(
      '/api/v1/integrations/providers/google-business-profile/selection',
      expect.objectContaining({ method: 'PUT', body: selection, idempotencyKey: 'idem:google-business-selection' }),
    );
  });

  test('queues review sync and reads authoritative worker status from dedicated endpoints', async () => {
    apiRequest.mockResolvedValueOnce({ providerId: 'google-business-profile', run: { id: 'run-1', status: 'QUEUED' } });
    await providerSync('google');
    expect(apiRequest).toHaveBeenLastCalledWith(
      '/api/v1/integrations/providers/google-business-profile/sync',
      expect.objectContaining({ method: 'POST', idempotencyKey: 'idem:integration-sync-google' }),
    );

    apiRequest.mockResolvedValueOnce({ providerId: 'google-business-profile', run: { id: 'run-1', status: 'SUCCESS', importedCount: 4 } });
    await providerSyncStatus('google');
    expect(apiRequest).toHaveBeenLastCalledWith(
      '/api/v1/integrations/providers/google-business-profile/sync-status',
      expect.objectContaining({ retries: 0 }),
    );
  });
});
