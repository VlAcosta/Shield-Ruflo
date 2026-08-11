import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getRuntimeEnv } from '../core/runtimeEnv';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

export type CompetitiveSnapshot = {
  id: string;
  observedAt: string;
  averageRating: number | null;
  reviewCount: number | null;
  reviewVelocity30d: number | null;
  positiveShare: number | null;
  negativeShare: number | null;
  responseRate: number | null;
  reputationScore: number | null;
  notes: string;
  provider: string | null;
  storagePolicy: string | null;
};

export type CompetitiveSource = {
  id: string;
  provider: 'manual' | 'google_places' | string;
  externalId: string | null;
  storagePolicy: 'persistable' | 'live_only' | string;
  status: string;
  lastCheckedAt: string | null;
  lastErrorCode: string | null;
};

export type CompetitiveLocation = {
  id: string;
  name: string;
  addressLabel: string | null;
  city: string | null;
  region: string | null;
  countryCode: string | null;
  website: string | null;
  sources: CompetitiveSource[];
  latestSnapshot: CompetitiveSnapshot | null;
};

export type Competitor = {
  id: string;
  name: string;
  website: string | null;
  status: 'active' | 'paused' | 'archived';
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: { id: string; name: string | null } | null;
  locations: CompetitiveLocation[];
};

export type CompetitiveBenchmark = {
  own: {
    period: { from: string; to: string };
    averageRating: number | null;
    reviewCount: number;
    reviewVelocity30d: number;
    positiveShare: number;
    negativeShare: number;
    responseRate: number;
  };
  competitors: Array<{
    competitorId: string;
    competitorName: string;
    locationId: string;
    locationName: string;
    metrics: CompetitiveSnapshot | null;
    coverage: { availableMetrics: string[]; liveGoogleLinked: boolean };
    deltas: Record<string, number | null> | null;
  }>;
  methodology: {
    competitorHistory: string;
    googlePlaces: string;
    comparisonWarning: string;
  };
};

type CompetitorListResponse = { items: Competitor[]; nextCursor: string | null };

function qs(values: Record<string, string | number | boolean | undefined | null>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const value = params.toString();
  return value ? `?${value}` : '';
}

export async function listCompetitors(filters: { status?: string; limit?: number; cursor?: string } = {}, options: { signal?: AbortSignal } = {}) {
  return apiRequest<CompetitorListResponse>(joinEndpoint(API_BASE, `/competitive/competitors${qs(filters)}`), {
    signal: options.signal,
    timeout: 12_000,
  });
}

export async function createCompetitor(input: {
  name: string;
  website?: string | null;
  notes?: string;
  locations: Array<{
    name: string;
    addressLabel?: string;
    city?: string;
    region?: string;
    countryCode?: string;
    website?: string | null;
    googlePlaceId?: string;
  }>;
}) {
  return apiRequest<{ competitor: Competitor }>(joinEndpoint(API_BASE, '/competitive/competitors'), {
    method: 'POST',
    body: input,
    timeout: 12_000,
  });
}

export async function updateCompetitor(competitorId: string, patch: Record<string, unknown>) {
  return apiRequest<{ competitor: Competitor }>(joinEndpoint(API_BASE, `/competitive/competitors/${encodeURIComponent(competitorId)}`), {
    method: 'PATCH',
    body: patch,
    timeout: 12_000,
  });
}

export async function addCompetitiveSnapshot(
  competitorId: string,
  locationId: string,
  input: {
    observedAt?: string;
    averageRating?: number | null;
    reviewCount?: number | null;
    reviewVelocity30d?: number | null;
    positiveShare?: number | null;
    negativeShare?: number | null;
    responseRate?: number | null;
    reputationScore?: number | null;
    notes?: string;
    dedupeKey?: string;
  },
) {
  return apiRequest<{ snapshot: CompetitiveSnapshot; deduplicated: boolean }>(
    joinEndpoint(API_BASE, `/competitive/competitors/${encodeURIComponent(competitorId)}/locations/${encodeURIComponent(locationId)}/snapshots`),
    { method: 'POST', body: input, timeout: 12_000 },
  );
}

export async function getCompetitiveBenchmark(
  filters: { businessId?: string; locationId?: string; from?: string; to?: string } = {},
  options: { signal?: AbortSignal } = {},
) {
  return apiRequest<CompetitiveBenchmark>(joinEndpoint(API_BASE, `/competitive/benchmark${qs(filters)}`), {
    signal: options.signal,
    timeout: 15_000,
  });
}

export async function getCompetitiveProviderAvailability(options: { signal?: AbortSignal } = {}) {
  return apiRequest<{
    googlePlaces: {
      configured: boolean;
      storagePolicy: 'LIVE_ONLY';
      maxReviewSample: number;
      attributionRequired: boolean;
      reasonCode?: string;
    };
  }>(joinEndpoint(API_BASE, '/competitive/providers'), { signal: options.signal, timeout: 10_000 });
}
