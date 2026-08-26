import { registerGoogleBusinessProfileProvider } from './google/index.js';
import { providerRegistry } from './provider.registry.js';
import { WildberriesProviderAdapter } from './wildberries/wildberries.adapter.js';
import { OzonProviderAdapter } from './ozon/ozon.adapter.js';
import { TwoGisProviderAdapter } from './two-gis/two-gis.adapter.js';
import { ReviewBridgeProviderAdapter } from './bridge/review-bridge.adapter.js';

let registered = false;

export function registerIntegrationProviders() {
  if (registered) return;
  registerGoogleBusinessProfileProvider();
  providerRegistry.register(new WildberriesProviderAdapter());
  providerRegistry.register(new OzonProviderAdapter());
  providerRegistry.register(new TwoGisProviderAdapter());
  providerRegistry.register(new ReviewBridgeProviderAdapter('yandex', 'Яндекс Бизнес'));
  providerRegistry.register(new ReviewBridgeProviderAdapter('otzovik', 'Отзовик'));
  registered = true;
}
