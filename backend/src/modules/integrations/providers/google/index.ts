import { providerRegistry } from '../provider.registry.js';
import { GoogleBusinessProfileAdapter, GOOGLE_BUSINESS_PROVIDER_ID } from './google-business-profile.adapter.js';

export function registerGoogleBusinessProfileProvider(): void {
  if (providerRegistry.has(GOOGLE_BUSINESS_PROVIDER_ID)) return;
  providerRegistry.register(new GoogleBusinessProfileAdapter());
}
