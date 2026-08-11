import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getRuntimeEnv } from '../core/runtimeEnv';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

export type ListingIssue = {
  id: string;
  type: 'MISSING' | 'MISMATCH' | 'STALE' | 'DUPLICATE' | 'UNMAPPED';
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  field: string;
  expected: unknown;
  observed: unknown;
  explanation: string;
  createdAt: string;
};

export type ListingSnapshot = {
  id: string;
  observedAt: string;
  providerUpdatedAt: string | null;
  healthScore: number;
  scoreVersion: number;
  normalized: Record<string, unknown>;
  issues: ListingIssue[];
};

export type ListingSource = {
  id: string;
  provider: string;
  externalLocationId: string;
  status: 'ACTIVE' | 'DEGRADED' | 'ERROR' | 'DISABLED';
  lastSyncedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  integrationAccount?: { id: string; name: string; provider: string; status: string };
  snapshots: ListingSnapshot[];
};

export type ListingHealthLocation = {
  id: string;
  name: string;
  phone: string | null;
  website: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  postalCode: string | null;
  regularHours: unknown;
  categories: unknown;
  attributes: unknown;
  images: unknown;
  business: { id: string; name: string };
  listingSources: ListingSource[];
  health: {
    measured: boolean;
    score: number | null;
    scoreVersion: number;
    sourceCount: number;
    measuredSourceCount: number;
    criticalIssues: number;
    warningIssues: number;
  };
};

export type ListingHealthOverview = {
  items: ListingHealthLocation[];
  summary: { locationCount: number; measuredLocations: number; averageHealthScore: number | null };
  methodology: { scoreVersion: number; weights: Record<string, number>; staleAfterDays: number };
};

export type ListingProviderAccount = {
  id: string;
  provider: string;
  providerName: string;
  name: string;
  status: string;
  externalAccountId: string | null;
};

export type ListingProviderLocation = {
  externalId: string;
  title: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  categories: string[];
  coveredFields: string[];
  observedAt: string | null;
  providerUpdatedAt: string | null;
};

function qs(values: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => { if (value) params.set(key, value); });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function getListingHealthOverview(filters: { businessId?: string; status?: string } = {}, options: { signal?: AbortSignal } = {}) {
  return apiRequest<ListingHealthOverview>(joinEndpoint(API_BASE, `/listing-health/locations${qs(filters)}`), { signal: options.signal, timeout: 12_000 });
}

export function getListingHealthLocation(locationId: string, options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ location: ListingHealthLocation; methodology: ListingHealthOverview['methodology'] }>(joinEndpoint(API_BASE, `/listing-health/locations/${encodeURIComponent(locationId)}`), { signal: options.signal, timeout: 12_000 });
}

export function updateCanonicalListing(locationId: string, patch: Record<string, unknown>) {
  return apiRequest<{ location: ListingHealthLocation }>(joinEndpoint(API_BASE, `/listing-health/locations/${encodeURIComponent(locationId)}/canonical`), { method: 'PATCH', body: patch, timeout: 12_000 });
}

export function getListingProviderAccounts(options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ items: ListingProviderAccount[] }>(joinEndpoint(API_BASE, '/listing-health/provider-accounts'), { signal: options.signal, timeout: 12_000 });
}

export function getListingProviderLocations(accountId: string, options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ provider: { id: string; name: string }; items: ListingProviderLocation[] }>(joinEndpoint(API_BASE, `/listing-health/provider-accounts/${encodeURIComponent(accountId)}/locations`), { signal: options.signal, timeout: 20_000 });
}

export function linkListingSource(locationId: string, input: { integrationAccountId: string; externalLocationId: string }) {
  return apiRequest<{ source: ListingSource }>(joinEndpoint(API_BASE, `/listing-health/locations/${encodeURIComponent(locationId)}/sources`), { method: 'POST', body: input, timeout: 12_000 });
}

export function syncListingSource(sourceId: string) {
  return apiRequest<{ job: { id: string; status: string }; deduplicated: boolean }>(joinEndpoint(API_BASE, `/listing-health/sources/${encodeURIComponent(sourceId)}/sync`), { method: 'POST', timeout: 12_000 });
}
