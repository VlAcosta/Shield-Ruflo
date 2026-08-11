import { getRuntimeEnv } from '../core/runtimeEnv';
import { apiRequest, joinEndpoint } from '../core/apiClient';

export type ReviewIntelligenceStatus = 'NOT_ANALYZED' | 'QUEUED' | 'ANALYZING' | 'AVAILABLE' | 'FAILED' | 'UNAVAILABLE' | 'STALE';

const API_BASE = String(getRuntimeEnv('API_BASE', '/api/v1')).replace(/\/$/, '');

function endpoint(reviewId: string, suffix = '') {
  return joinEndpoint(API_BASE, `/reviews/${encodeURIComponent(reviewId)}/intelligence${suffix}`);
}

export async function getReviewIntelligence(reviewId: string, options: { signal?: AbortSignal } = {}) {
  return apiRequest(endpoint(reviewId), {
    signal: options.signal,
    timeout: 10_000,
  });
}

export async function reanalyzeReview(reviewId: string) {
  return apiRequest(endpoint(reviewId, '/reanalyze'), {
    method: 'POST',
    timeout: 10_000,
  });
}
