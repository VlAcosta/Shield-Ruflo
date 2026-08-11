import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getRuntimeEnv } from '../core/runtimeEnv';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

export type ReputationCaseStatus =
  | 'new'
  | 'triaged'
  | 'assigned'
  | 'in_progress'
  | 'waiting_customer'
  | 'waiting_internal'
  | 'resolved'
  | 'verified'
  | 'closed';

export type ReputationCaseSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ReputationCase = {
  id: string;
  title: string;
  category: string;
  severity: ReputationCaseSeverity;
  status: ReputationCaseStatus;
  origin: string;
  ownerMemberId: string | null;
  owner: { memberId: string; userId: string; name: string | null } | null;
  slaMinutes: number | null;
  dueAt: string | null;
  rootCause: string;
  resolution: string;
  outcome: Record<string, unknown> | null;
  reopenedAt: string | null;
  resolvedAt: string | null;
  verifiedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  reviews: Array<{
    id: string;
    rating: number;
    text: string;
    receivedAt: string;
    repliedAt: string | null;
    locationId: string | null;
    provider: string | null;
    sourceName: string | null;
  }>;
  locations: Array<{ id: string; name: string; city?: string | null; region?: string | null }>;
  tasks: Array<{ id: string; title: string; status: string; priority: string; deadline: string | null; reviewId: string | null }>;
  activities: Array<{ id: string; action: string; fromStatus?: string | null; toStatus?: string | null; metadata?: unknown; createdAt: string }>;
  metricSnapshots: Array<{ id: string; phase: string; metrics: Record<string, unknown>; periodStart: string; periodEnd: string; measuredAt: string }>;
};

type CaseListResponse = { items: ReputationCase[]; nextCursor: string | null };

type ListFilters = {
  status?: string;
  severity?: string;
  ownerMemberId?: string;
  locationId?: string;
  category?: string;
  overdue?: boolean;
  cursor?: string;
  limit?: number;
};

function queryString(filters: ListFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const value = params.toString();
  return value ? `?${value}` : '';
}

export async function listReputationCases(filters: ListFilters = {}, options: { signal?: AbortSignal } = {}) {
  return apiRequest<CaseListResponse>(joinEndpoint(API_BASE, `/cases${queryString(filters)}`), {
    signal: options.signal,
    timeout: 12_000,
  });
}

export async function getReputationCase(caseId: string, options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ case: ReputationCase }>(joinEndpoint(API_BASE, `/cases/${encodeURIComponent(caseId)}`), {
    signal: options.signal,
    timeout: 12_000,
  });
}

export async function createReputationCase(input: {
  title?: string;
  category?: string;
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  ownerMemberId?: string | null;
  slaMinutes?: number | null;
  dueAt?: string | null;
  rootCause?: string | null;
  reviewIds?: string[];
  locationIds?: string[];
}) {
  return apiRequest<{ case: ReputationCase; deduplicated: boolean }>(joinEndpoint(API_BASE, '/cases'), {
    method: 'POST',
    body: input,
    timeout: 12_000,
  });
}

export async function updateReputationCase(caseId: string, patch: Record<string, unknown>) {
  return apiRequest<{ case: ReputationCase }>(joinEndpoint(API_BASE, `/cases/${encodeURIComponent(caseId)}`), {
    method: 'PATCH',
    body: patch,
    timeout: 12_000,
  });
}

export async function transitionReputationCase(caseId: string, status: string, input: { note?: string; resolution?: string } = {}) {
  return apiRequest<{ case: ReputationCase }>(joinEndpoint(API_BASE, `/cases/${encodeURIComponent(caseId)}/transition`), {
    method: 'POST',
    body: { status, ...input },
    timeout: 12_000,
  });
}

export async function verifyReputationCase(caseId: string, note = '') {
  return apiRequest<{ case: ReputationCase }>(joinEndpoint(API_BASE, `/cases/${encodeURIComponent(caseId)}/verify`), {
    method: 'POST',
    body: note ? { note } : {},
    timeout: 15_000,
  });
}

export async function closeReputationCase(caseId: string, note = '') {
  return apiRequest<{ case: ReputationCase }>(joinEndpoint(API_BASE, `/cases/${encodeURIComponent(caseId)}/close`), {
    method: 'POST',
    body: note ? { note } : {},
    timeout: 12_000,
  });
}

export async function reopenReputationCase(caseId: string, note: string) {
  return apiRequest<{ case: ReputationCase }>(joinEndpoint(API_BASE, `/cases/${encodeURIComponent(caseId)}/reopen`), {
    method: 'POST',
    body: { note },
    timeout: 12_000,
  });
}

export async function createCaseTask(caseId: string, input: { title: string; description?: string; priority?: string; deadline?: string | null }) {
  return apiRequest<{ task: { id: string } }>(joinEndpoint(API_BASE, `/cases/${encodeURIComponent(caseId)}/tasks`), {
    method: 'POST',
    body: input,
    timeout: 12_000,
  });
}
