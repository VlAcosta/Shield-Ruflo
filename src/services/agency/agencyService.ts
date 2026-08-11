import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getRuntimeEnv } from '../core/runtimeEnv';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

export type AgencyClientSummary = {
  link: { id: string; status: 'ACTIVE' | 'PAUSED' | 'REVOKED'; clientOrganizationId: string; acceptedAt: string };
  summary: {
    organization: { id: string; name: string; slug: string } | null;
    reputation: { reviewCount: number; averageRating: number | null; negativeReviewCount: number; openCaseCount: number; overdueTaskCount: number };
    listings: { snapshotCount: number; averageHealthScore: number | null };
    aiVisibility: { successfulRuns: number; brandMentionRuns: number; mentionRate: number | null };
  };
};

export function getAgencyPortfolio(options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ portfolio: { id: string; name: string }; clients: AgencyClientSummary[] }>(joinEndpoint(API_BASE, '/agency/portfolio'), { signal: options.signal, timeout: 15_000 });
}

export function createAgencyInvitation(clientOrganizationId: string) {
  return apiRequest<{ invitation: { id: string; expiresAt: string }; token: string; targetOrganization: { id: string; name: string } }>(joinEndpoint(API_BASE, '/agency/invitations'), { method: 'POST', body: { clientOrganizationId }, timeout: 12_000 });
}

export function acceptAgencyInvitation(token: string) {
  return apiRequest<{ link: { id: string }; agencyOrganization: { id: string; name: string } }>(joinEndpoint(API_BASE, `/agency/invitations/${encodeURIComponent(token)}/accept`), { method: 'POST', timeout: 12_000 });
}

export function updateAgencyClient(linkId: string, status: 'ACTIVE' | 'PAUSED' | 'REVOKED') {
  return apiRequest<{ link: { id: string; status: string } }>(joinEndpoint(API_BASE, `/agency/clients/${encodeURIComponent(linkId)}`), { method: 'PATCH', body: { status }, timeout: 12_000 });
}
