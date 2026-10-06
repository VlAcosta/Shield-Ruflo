import { beforeEach, describe, expect, test, vi } from 'vitest';
import { disconnectIntegration } from './integrationService';
import {
  hasIntegrationBackend,
  providerDisconnect,
} from './integrationProviderRegistry';

vi.mock('./integrationProviderRegistry', () => ({
  getClientProviderId: (value) => value,
  getProviderCapabilities: () => [],
  getProviderRuntime: () => ({
    transport: 'unavailable',
    releaseStage: 'PLANNED',
    connectable: false,
    capabilities: [],
  }),
  hasIntegrationBackend: vi.fn(),
  providerAccounts: vi.fn(),
  providerConnect: vi.fn(),
  providerDiagnostics: vi.fn(),
  providerDisconnect: vi.fn(),
  providerReconnect: vi.fn(),
  providerSync: vi.fn(),
}));

describe('integrationService provider safety', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  test('disconnects an unavailable provider locally without calling a missing backend adapter', async () => {
    hasIntegrationBackend.mockImplementation((providerId) => {
      expect(providerId).toBe('yandex');
      return false;
    });

    const result = await disconnectIntegration('yandex');

    expect(providerDisconnect).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      id: 'yandex',
      enabled: false,
      status: 'disconnected',
    });
  });
});
