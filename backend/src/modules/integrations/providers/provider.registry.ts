import type { ProviderAdapter, ProviderCatalogItem } from './provider.types.js';

function normalizeProviderId(value: string): string {
  return value.trim().toLowerCase();
}

export class ProviderRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  register(adapter: ProviderAdapter): void {
    const id = normalizeProviderId(adapter.id);
    if (!id) throw new Error('PROVIDER_ID_REQUIRED');
    if (this.adapters.has(id)) throw new Error(`PROVIDER_ADAPTER_ALREADY_REGISTERED:${id}`);
    this.adapters.set(id, adapter);
  }

  unregister(providerId: string): boolean {
    return this.adapters.delete(normalizeProviderId(providerId));
  }

  get(providerId: string): ProviderAdapter | null {
    return this.adapters.get(normalizeProviderId(providerId)) ?? null;
  }

  has(providerId: string): boolean {
    return this.adapters.has(normalizeProviderId(providerId));
  }

  list(): ProviderCatalogItem[] {
    return [...this.adapters.values()]
      .map((adapter) => ({
        id: normalizeProviderId(adapter.id),
        displayName: adapter.displayName,
        capabilities: [...adapter.capabilities],
        availability: adapter.availability(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
  }
}

export const providerRegistry = new ProviderRegistry();
