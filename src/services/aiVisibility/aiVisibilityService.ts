import { apiRequest, joinEndpoint } from '../core/apiClient';
import { getRuntimeEnv } from '../core/runtimeEnv';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

export type AiVisibilityCitation = { id: string; url: string; title: string | null; domain: string | null; position: number | null };
export type AiVisibilityCompetitor = { id: string; name: string; position: number | null; matchedCompetitorId: string | null };
export type AiVisibilityResult = {
  brandMentioned: boolean;
  brandPosition: number | null;
  sentiment: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'MIXED' | 'UNKNOWN';
  answerText: string;
  recommendations: string[];
  citationMeasurement: 'SUPPORTED' | 'UNSUPPORTED';
  citations: AiVisibilityCitation[];
  competitors: AiVisibilityCompetitor[];
};
export type AiVisibilityRun = {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  provider: string | null;
  model: string | null;
  promptVersion: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  queuedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  result: AiVisibilityResult | null;
};
export type AiVisibilityProbe = {
  id: string;
  name: string;
  query: string;
  languageCode: string;
  countryCode: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
  location: { id: string; name: string; city: string | null } | null;
  runs: AiVisibilityRun[];
};
export type AiVisibilityMetrics = {
  sampleSize: number;
  brandMentionRate: number | null;
  shareOfAiVoice: number | null;
  averageAiPosition: number | null;
  competitorMentionRate: number | null;
  citationCoverage: number | null;
  citationQuality: { measured: boolean; reason: string };
  aiSentiment: Record<string, number>;
  locationVisibility: Array<{ locationId: string; sampleSize: number; mentionRate: number }>;
  methodology: Record<string, string>;
};

function qs(values: Record<string, string | number | undefined | null>) {
  const params = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const value = params.toString();
  return value ? `?${value}` : '';
}

export async function listAiVisibilityProbes(filters: { status?: string; limit?: number; cursor?: string } = {}, options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ items: AiVisibilityProbe[]; nextCursor: string | null }>(joinEndpoint(API_BASE, `/ai-visibility/probes${qs(filters)}`), { signal: options.signal, timeout: 12_000 });
}

export async function createAiVisibilityProbe(input: { name: string; query: string; languageCode?: string; countryCode?: string | null; locationId?: string | null }) {
  return apiRequest<{ probe: AiVisibilityProbe }>(joinEndpoint(API_BASE, '/ai-visibility/probes'), { method: 'POST', body: input, timeout: 12_000 });
}

export async function updateAiVisibilityProbe(probeId: string, patch: Record<string, unknown>) {
  return apiRequest<{ probe: AiVisibilityProbe }>(joinEndpoint(API_BASE, `/ai-visibility/probes/${encodeURIComponent(probeId)}`), { method: 'PATCH', body: patch, timeout: 12_000 });
}

export async function runAiVisibilityProbe(probeId: string) {
  return apiRequest<{ run: AiVisibilityRun; deduplicated: boolean }>(joinEndpoint(API_BASE, `/ai-visibility/probes/${encodeURIComponent(probeId)}/runs`), { method: 'POST', timeout: 15_000 });
}

export async function getAiVisibilityRun(runId: string, options: { signal?: AbortSignal } = {}) {
  return apiRequest<{ run: AiVisibilityRun }>(joinEndpoint(API_BASE, `/ai-visibility/runs/${encodeURIComponent(runId)}`), { signal: options.signal, timeout: 12_000 });
}

export async function getAiVisibilityMetrics(filters: { from?: string; to?: string; locationId?: string } = {}, options: { signal?: AbortSignal } = {}) {
  return apiRequest<AiVisibilityMetrics>(joinEndpoint(API_BASE, `/ai-visibility/metrics${qs(filters)}`), { signal: options.signal, timeout: 12_000 });
}
