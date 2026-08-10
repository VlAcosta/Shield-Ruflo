import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from '../src/modules/integrations/providers/provider.registry.js';
import type { ProviderAdapter } from '../src/modules/integrations/providers/provider.types.js';
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
} from '../src/modules/integrations/providers/credential-vault.js';
import {
  asProviderAdapterError,
  ProviderAdapterError,
} from '../src/modules/integrations/providers/provider.errors.js';

function adapter(id = 'Google-Business'): ProviderAdapter {
  return {
    id,
    displayName: 'Google Business Profile',
    capabilities: ['oauth', 'locations.read', 'reviews.read'],
    availability: () => ({ configured: true, connectable: true }),
    connect: vi.fn(async () => ({ verified: true as const, health: 'CONNECTED' as const })),
    syncReviews: vi.fn(async () => ({ reviews: [], hasMore: false })),
  };
}

describe('P15 provider adapter SDK', () => {
  it('normalizes provider ids, rejects duplicate adapters and publishes truthful catalog metadata', () => {
    const registry = new ProviderRegistry();
    registry.register(adapter());

    expect(registry.has('google-business')).toBe(true);
    expect(registry.get('GOOGLE-BUSINESS')?.displayName).toBe('Google Business Profile');
    expect(registry.list()).toEqual([{
      id: 'google-business',
      displayName: 'Google Business Profile',
      capabilities: ['oauth', 'locations.read', 'reviews.read'],
      availability: { configured: true, connectable: true },
    }]);
    expect(() => registry.register(adapter('google-business'))).toThrow('PROVIDER_ADAPTER_ALREADY_REGISTERED:google-business');
    expect(registry.unregister('GOOGLE-BUSINESS')).toBe(true);
    expect(registry.get('google-business')).toBeNull();
  });

  it('round-trips encrypted credentials without storing plaintext', () => {
    const plaintext = 'provider-secret-that-must-never-leak';
    const encrypted = encryptIntegrationSecret(plaintext);
    expect(encrypted).not.toContain(plaintext);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(decryptIntegrationSecret(encrypted)).toBe(plaintext);
  });

  it('preserves explicitly sanitized provider errors and redacts unknown SDK failures', () => {
    const explicit = new ProviderAdapterError({
      code: 'PROVIDER_RATE_LIMITED',
      message: 'Провайдер временно ограничил запросы',
      retryable: true,
      statusCode: 429,
    });
    expect(asProviderAdapterError(explicit)).toBe(explicit);

    const unknown = asProviderAdapterError(new Error('token=super-secret upstream dump'));
    expect(unknown.code).toBe('PROVIDER_REQUEST_FAILED');
    expect(unknown.retryable).toBe(true);
    expect(unknown.message).toBe('Не удалось выполнить запрос к внешнему провайдеру');
    expect(unknown.message).not.toContain('super-secret');
  });
});
