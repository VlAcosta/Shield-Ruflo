import type {
  ProviderAdapter,
  ProviderConnectionContext,
  ProviderLocationProfileRecord,
  ProviderLocationProfileSyncResult,
} from '../provider.types.js';
import { configString, providerFetchJson, requireCredential } from '../provider-http.js';
import { ProviderAdapterError } from '../provider.errors.js';

const DEFAULT_BASE_URL = 'https://catalog.api.2gis.com';

type TwoGisItem = {
  id?: string;
  name?: string;
  full_name?: string;
  address_name?: string;
  full_address_name?: string;
  purpose_name?: string;
  reviews?: {
    general_rating?: number;
    general_review_count?: number;
    is_reviewable?: boolean;
  };
  statistics?: Record<string, unknown>;
  schedule?: Record<string, unknown>;
};

type TwoGisResponse = {
  meta?: { code?: number; error?: { message?: string } };
  result?: { items?: TwoGisItem[] };
};

function baseUrl(context: ProviderConnectionContext): string {
  return (configString(context.configuration, 'apiBaseUrl') || DEFAULT_BASE_URL).replace(/\/$/, '');
}

function placeId(context: ProviderConnectionContext): string {
  const value = configString(context.configuration, 'placeId') || String(context.externalAccountId || '').trim();
  if (!value) {
    throw new ProviderAdapterError({
      code: '2GIS_PLACE_ID_REQUIRED',
      message: '2GIS: укажите ID организации из 2GIS',
      statusCode: 422,
      retryable: false,
    });
  }
  return value;
}

function mapItem(item: TwoGisItem): ProviderLocationProfileRecord {
  return {
    externalLocationId: String(item.id || ''),
    name: String(item.name || item.full_name || '2GIS'),
    address: item.full_address_name || item.address_name,
    rating: typeof item.reviews?.general_rating === 'number' ? item.reviews.general_rating : undefined,
    reviewCount: typeof item.reviews?.general_review_count === 'number' ? item.reviews.general_review_count : undefined,
    raw: {
      purposeName: item.purpose_name ?? null,
      reviewable: item.reviews?.is_reviewable ?? null,
      statistics: item.statistics ?? {},
      schedule: item.schedule ?? {},
      reviewTextAvailableViaApi: false,
    },
  };
}

async function loadItem(context: ProviderConnectionContext): Promise<TwoGisItem> {
  const id = placeId(context);
  const key = requireCredential(context.credentials, 'apiKey', '2gis');
  const query = new URLSearchParams({
    id,
    key,
    fields: 'items.reviews,items.statistics,items.schedule,items.full_address_name',
  });
  const payload = await providerFetchJson<TwoGisResponse>(`${baseUrl(context)}/3.0/items/byid?${query}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  }, { provider: '2gis' });
  if (payload.meta?.code && payload.meta.code !== 200) {
    throw new ProviderAdapterError({
      code: '2GIS_API_ERROR',
      message: payload.meta.error?.message || `2GIS API code ${payload.meta.code}`,
      statusCode: 502,
      retryable: true,
    });
  }
  const item = payload.result?.items?.[0];
  if (!item?.id) {
    throw new ProviderAdapterError({
      code: '2GIS_PLACE_NOT_FOUND',
      message: '2GIS: организация не найдена или недоступна текущему API-ключу',
      statusCode: 422,
      retryable: false,
    });
  }
  return item;
}

export class TwoGisProviderAdapter implements ProviderAdapter {
  readonly id = '2gis';
  readonly displayName = '2GIS';
  // Official Places API exposes organization/profile and review statistics,
  // but not review text. Do not advertise reviews.read/reply.
  readonly capabilities = ['profile.read', 'locations.read'] as const;

  availability() {
    return { configured: true, connectable: true };
  }

  async connect(context: ProviderConnectionContext) {
    const item = await loadItem(context);
    return {
      verified: true as const,
      health: 'CONNECTED' as const,
      externalAccountId: String(item.id),
      configuration: {
        apiBaseUrl: baseUrl(context),
        placeId: String(item.id),
        profileSnapshot: mapItem(item),
        reviewTextAvailableViaApi: false,
        syncEnabled: false,
      },
      validatedAt: new Date(),
    };
  }

  async disconnect() {
    return { confirmed: true };
  }

  async syncLocationProfiles(context: ProviderConnectionContext): Promise<ProviderLocationProfileSyncResult> {
    return { locations: [mapItem(await loadItem(context))] };
  }
}
