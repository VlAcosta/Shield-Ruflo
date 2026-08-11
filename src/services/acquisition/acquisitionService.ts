import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getRuntimeEnv } from '../core/runtimeEnv';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

export type AcquisitionTarget = {
  id: string;
  provider: string;
  label: string;
  priority: number;
  enabled?: boolean;
  url?: string;
};

export type AcquisitionCampaign = {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'paused' | 'archived';
  channel: string;
  businessId: string | null;
  locationId: string | null;
  business: { id: string; name: string } | null;
  location: { id: string; name: string; city?: string | null; region?: string | null } | null;
  publicSlug: string;
  publicPath: string;
  headline: string;
  description: string;
  thankYouMessage: string;
  collectContact: boolean;
  caseBelowRating: number | null;
  targets: AcquisitionTarget[];
  createdAt: string;
  updatedAt: string;
};

export type AcquisitionMetrics = {
  period: { from: string; to: string };
  views: number;
  feedbackSubmitted: number;
  publicReviewTargetClicks: number;
  feedbackConversion: number;
  publicReviewClickConversion: number;
  averageFirstPartyRating: number | null;
  casesOpened: number;
  ratingBreakdown: Array<{ rating: number; count: number }>;
};

export type PublicAcquisitionCampaign = {
  slug: string;
  headline: string;
  description: string;
  thankYouMessage: string;
  collectContact: boolean;
  location: { name: string; city?: string | null; region?: string | null } | null;
  publicReviewTargets: AcquisitionTarget[];
};

type CampaignListResponse = { items: AcquisitionCampaign[]; nextCursor: string | null };

function qs(values: Record<string, string | number | boolean | undefined | null>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function acquisitionPublicApiPath(slug: string, suffix = '', query: Record<string, string | undefined> = {}) {
  return joinEndpoint(API_BASE, `/public/review-acquisition/${encodeURIComponent(slug)}${suffix}${qs(query)}`);
}

export async function listAcquisitionCampaigns(filters: { status?: string; locationId?: string; limit?: number; cursor?: string } = {}, options: { signal?: AbortSignal } = {}) {
  return apiRequest<CampaignListResponse>(joinEndpoint(API_BASE, `/acquisition/campaigns${qs(filters)}`), {
    signal: options.signal,
    timeout: 12_000,
  });
}

export async function createAcquisitionCampaign(input: {
  name: string;
  businessId?: string | null;
  locationId?: string | null;
  channel?: string;
  headline?: string;
  description?: string;
  thankYouMessage?: string;
  collectContact?: boolean;
  caseBelowRating?: number | null;
  targets?: Array<{ provider: string; label: string; url: string; priority?: number; enabled?: boolean }>;
}) {
  return apiRequest<{ campaign: AcquisitionCampaign }>(joinEndpoint(API_BASE, '/acquisition/campaigns'), {
    method: 'POST',
    body: input,
    timeout: 12_000,
  });
}

export async function updateAcquisitionCampaign(campaignId: string, patch: Record<string, unknown>) {
  return apiRequest<{ campaign: AcquisitionCampaign }>(joinEndpoint(API_BASE, `/acquisition/campaigns/${encodeURIComponent(campaignId)}`), {
    method: 'PATCH',
    body: patch,
    timeout: 12_000,
  });
}

export async function getAcquisitionMetrics(campaignId: string, options: { signal?: AbortSignal } = {}) {
  return apiRequest<AcquisitionMetrics>(joinEndpoint(API_BASE, `/acquisition/campaigns/${encodeURIComponent(campaignId)}/metrics`), {
    signal: options.signal,
    timeout: 12_000,
  });
}

export async function createAcquisitionInvite(campaignId: string, input: { channel?: string; expiresInDays?: number; externalReference?: string } = {}) {
  return apiRequest<{ invite: { id: string; status: string; channel: string; expiresAt: string; publicPath: string; delivery: { status: string; reason: string } } }>(
    joinEndpoint(API_BASE, `/acquisition/campaigns/${encodeURIComponent(campaignId)}/invites`),
    { method: 'POST', body: input, timeout: 12_000 },
  );
}

export async function getPublicAcquisitionCampaign(slug: string, input: { invite?: string; session?: string } = {}, options: { signal?: AbortSignal } = {}) {
  return apiRequest<{
    campaign: PublicAcquisitionCampaign;
    invite: { id: string; channel: string } | null;
    compliance: { reviewGating: false; message: string };
  }>(acquisitionPublicApiPath(slug, '', input), { signal: options.signal, timeout: 12_000 });
}

export async function submitAcquisitionFeedback(slug: string, input: {
  rating: number;
  text: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  consentToContact: boolean;
  invite?: string;
  session?: string;
}) {
  return apiRequest<{
    feedbackId: string;
    thankYouMessage: string;
    caseOpened: boolean;
    publicReviewTargets: AcquisitionTarget[];
    compliance: { reviewGating: false };
  }>(acquisitionPublicApiPath(slug, '/feedback'), { method: 'POST', body: input, timeout: 15_000 });
}
