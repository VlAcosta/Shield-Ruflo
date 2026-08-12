import { providerRegistry } from './provider.registry.js';
import type { ProviderCapability } from './provider.types.js';

export type ProviderReleaseStage = 'PRODUCTION_ADAPTER' | 'ADAPTER_NOT_CONFIGURED' | 'PLANNED';

export type ProviderTruthItem = {
  id: string;
  displayName: string;
  releaseStage: ProviderReleaseStage;
  configured: boolean;
  connectable: boolean;
  capabilities: {
    oauth: boolean;
    accountsRead: boolean;
    locationsRead: boolean;
    profileRead: boolean;
    reviewIngest: boolean;
    reviewRead: boolean;
    reviewReply: boolean;
    reviewDelete: boolean;
  };
  sync: {
    supported: boolean;
    frequency: 'on_demand_job' | 'unavailable';
    retryAttempts: number | null;
    dedupe: boolean;
  };
  availability: {
    reasonCode: string | null;
    reasonMessage: string | null;
  };
};

type PlannedProvider = {
  id: string;
  displayName: string;
};

// IDs intentionally match the existing client/provider registry so a planned
// source cannot become a separate shadow identity when a real adapter lands.
const PLANNED_PROVIDERS: readonly PlannedProvider[] = Object.freeze([
  { id: 'yandex', displayName: 'Яндекс Бизнес' },
  { id: '2gis', displayName: '2GIS' },
  { id: 'ozon', displayName: 'Ozon' },
  { id: 'otzovik', displayName: 'Отзовик' },
  { id: 'wb', displayName: 'Wildberries' },
]);

function runtimeTruth(providerId: string): ProviderTruthItem | null {
  const adapter = providerRegistry.get(providerId);
  if (!adapter) return null;
  const availability = adapter.availability();
  const has = (capability: ProviderCapability) => adapter.capabilities.includes(capability);
  const reviewIngest = has('reviews.read') && typeof adapter.syncReviews === 'function';
  const reviewReply = has('reviews.reply') && typeof adapter.publishReply === 'function';
  const releaseStage: ProviderReleaseStage = availability.configured && availability.connectable
    ? 'PRODUCTION_ADAPTER'
    : 'ADAPTER_NOT_CONFIGURED';

  return {
    id: adapter.id,
    displayName: adapter.displayName,
    releaseStage,
    configured: availability.configured,
    connectable: availability.connectable,
    capabilities: {
      oauth: has('oauth'),
      accountsRead: has('accounts.read'),
      locationsRead: has('locations.read'),
      profileRead: has('profile.read'),
      reviewIngest,
      reviewRead: has('reviews.read'),
      reviewReply,
      // There is no delete method in the provider adapter contract today.
      reviewDelete: false,
    },
    sync: {
      supported: reviewIngest,
      // Current runtime exposes queued on-demand sync jobs; no periodic SLA is
      // claimed until a scheduler/contract is implemented and monitored.
      frequency: reviewIngest ? 'on_demand_job' : 'unavailable',
      retryAttempts: reviewIngest ? 5 : null,
      dedupe: reviewIngest,
    },
    availability: {
      reasonCode: availability.reasonCode ?? null,
      reasonMessage: availability.reasonMessage ?? null,
    },
  };
}

function plannedTruth(provider: PlannedProvider): ProviderTruthItem {
  return {
    id: provider.id,
    displayName: provider.displayName,
    releaseStage: 'PLANNED',
    configured: false,
    connectable: false,
    capabilities: {
      oauth: false,
      accountsRead: false,
      locationsRead: false,
      profileRead: false,
      reviewIngest: false,
      reviewRead: false,
      reviewReply: false,
      reviewDelete: false,
    },
    sync: {
      supported: false,
      frequency: 'unavailable',
      retryAttempts: null,
      dedupe: false,
    },
    availability: {
      reasonCode: 'PROVIDER_ADAPTER_NOT_IMPLEMENTED',
      reasonMessage: 'Production adapter ещё не реализован и не прошёл capability contract tests.',
    },
  };
}

export function providerTruthMatrix(): ProviderTruthItem[] {
  const runtime = providerRegistry.list().map((item) => runtimeTruth(item.id)).filter((item): item is ProviderTruthItem => Boolean(item));
  const runtimeIds = new Set(runtime.map((item) => item.id));
  const planned = PLANNED_PROVIDERS.filter((item) => !runtimeIds.has(item.id)).map(plannedTruth);
  return [...runtime, ...planned];
}

export function providerTruth(providerId: string): ProviderTruthItem | null {
  const normalized = providerId.trim().toLowerCase();
  return providerTruthMatrix().find((item) => item.id === normalized) ?? null;
}
