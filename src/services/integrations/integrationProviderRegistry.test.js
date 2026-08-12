import {
  clearProviderTruthCache,
  getBackendProviderId,
  getProviderCapabilities,
  getProviderRuntime,
  googleBusinessAccounts,
  googleBusinessLocations,
  googleBusinessOAuthStart,
  googleBusinessSelect,
  providerSync,
  providerSyncStatus,
  refreshProviderTruth,
} from './integrationProviderRegistry';
import { apiRequest } from '../core/apiClient';

vi.mock('../core/runtimeEnv', () => ({
  getRuntimeEnv: (key, fallback) => {
    if (key === 'INTEGRATIONS_ENDPOINT') return '/api/v1/integrations';
    if (key === 'API_BASE') return '/api/v1';
    return fallback;
  },
}));

vi.mock('../core/apiClient', () => ({
  apiRequest: vi.fn(),
  createIdempotencyKey: vi.fn((scope) => `idem:${scope}`),
  joinEndpoint: (base, path) => `${String(base).replace(/\/$/, '')}/${String(path).replace(/^\//, '')}`,
}));

describe('provider truth frontend contract', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    clearProviderTruthCache();
  });

  test('fails closed until server capability truth is loaded', () => {
    expect(getBackendProviderId('google')).toBe('google-business-profile');
    expect(getProviderCapabilities('google')).toEqual([]);
    expect(getProviderCapabilities('yandex')).toEqual([]);
    expect(getProviderRuntime('google')).toMatchObject({
      transport: 'unavailable',
      releaseStage: 'UNKNOWN',
      reasonCode: 'PROVIDER_TRUTH_NOT_LOADED',
    });
  });

  test('claims Google read/reply only from the registered adapter and keeps planned providers disabled', async () => {
    apiRequest.mockResolvedValue({
      providers: [
        {
          id: 'google-business-profile',
          displayName: 'Google Business Profile',
          releaseStage: 'PRODUCTION_ADAPTER',
          configured: true,
          connectable: true,
          capabilities: {
            oauth: true,
            accountsRead: true,
            locationsRead: true,
            profileRead: true,
            reviewIngest: true,
            reviewRead: true,
            reviewReply: true,
            reviewDelete: false,
          },
          sync: { supported: true, frequency: 'on_demand_job', retryAttempts: 5, dedupe: true },
          availability: { reasonCode: null, reasonMessage: null },
        },
        {
          id: 'yandex',
          displayName: 'Яндекс Бизнес',
          releaseStage: 'PLANNED',
          configured: false,
          connectable: false,
          capabilities: {},
          sync: { supported: false, frequency: 'unavailable', retryAttempts: null, dedupe: false },
          availability: { reasonCode: 'PROVIDER_ADAPTER_NOT_IMPLEMENTED', reasonMessage: 'not implemented' },
        },
      ],
    });

    await refreshProviderTruth();
    expect(apiRequest).toHaveBeenCalledWith('/api/v1/meta/providers', expect.objectContaining({ retries: 0, timeout: 6000 }));
    expect(getProviderCapabilities('google')).toEqual([
      'oauth', 'accounts.read', 'locations.read', 'profile.read', 'reviews.read', 'rating.read', 'replies.write',
    ]);
    expect(getProviderRuntime('google')).toMatchObject({ transport: 'backend', connectable: true, releaseStage: 'PRODUCTION_ADAPTER' });
    expect(getProviderCapabilities('yandex')).toEqual([]);
    expect(getProviderRuntime('yandex')).toMatchObject({ transport: 'planned', connectable: false, releaseStage: 'PLANNED' });
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
